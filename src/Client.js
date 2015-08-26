import Emitter from 'emitter-component'
import Backoff from 'backo'
import Multiplexer from 'lpio-multiplexer-js'
import uid from 'get-uid'

import request from './request'

export default class Client {
  static DEFAULTS = {
    id: undefined,
    url: '/lpio',
    disconnectedAfter: 5,
    multiplex: undefined,
    backoff: undefined,
    ackTimeout: 10000,
    pingInterval: 25000
  }

  constructor(options) {
    this.options = { ...Client.DEFAULTS, ...options}
    this.connected = false
    this.disabled = true
    this.backoff = new Backoff(this.options.backoff)
    this.multiplexer = new Multiplexer(this.options.multiplex)
    this.out = new Emitter()
    this.in = new Emitter()
  }

  /**
   * Connect the client.
   *
   * @api public
   */
  connect() {
    if (this.connected || this.loading) return this

    let err
    if (!this.options.id) err = new Error('Client id is undefined.')
    if (!this.options.user) err = new Error('User is undefined.')
    if (err) {
      setTimeout(this.onError.bind(this, err))
      return this.out
    }

    this.disabled = false
    this.multiplexer.on('drain', ::this.onDrain)
    this.pingIntervalId = setInterval(::this.ping, this.options.pingInterval)
    // First thing to do is a ping request, because we can only safe for sure
    // we are connected when we got a response.
    this.ping()
    return this.out
  }

  /**
   * Disconnect the client.
   *
   * @api public
   */
  disconnect() {
    let {connected} = this
    this.disabled = true
    this.connected = false
    this.multiplexer.off('drain')
    if (this.request) this.request.abort()
    clearInterval(this.pingIntervalId)
    if (connected) this.out.emit('disconnected')
    return this
  }

  /**
   * Send a message.
   *
   * @api public
   */
  send(options, callback) {
    if (options.type === 'user') {
      let err
      if (!options.data) err = new Error('Data is undefined.')
      if (!options.recipient) err = new Error('Recipient is undefined.')
      if (err) return setTimeout(callback.bind(null, err))
    }

    let message = {
      id: String(uid()),
      type: 'user',
      client: this.options.id,
      sender: this.options.user,
      ...options
    }

    this.multiplexer.add(message)
    if (callback) this.subscribeAck(message, callback)
    return this
  }

  /**
   * Subscribes ack for message, implements a timeout.
   *
   * @api private
   */
  subscribeAck(message, callback) {
    let timeoutId
    let onAck = () => {
      clearTimeout(timeoutId)
      callback()
    }
    this.in.once(`ack:${message.id}`, onAck)
    timeoutId = setTimeout(() => {
      this.in.off(`ack:${message.id}`, onAck)
      callback(new Error('Delivery timeout.'))
    }, this.options.ackTimeout)
  }

  /**
   * Send a ping message.
   *
   * @api private
   */
  ping() {
    this.send({type: 'ping'})
  }

  /**
   * Opens request and sends messages.
   *
   * @api private
   */
  open(messages = []) {
    if (this.disabled || this.loading) {
      // Never loose messages, even if right now this situation should
      // not possible, its better to handle them always.
      this.multiplexer.add(messages)
      return
    }

    this.loading = true

    this.request = request({
      url: this.options.url,
      data: {
        client: this.options.id,
        user: this.options.user,
        messages
      },
      success: ::this.onRequestSuccess,
      error: this.onRequestError.bind(this, messages),
      close: ::this.onRequestClose
    })
  }

  /**
   * Reopens request using backoff.
   *
   * @api private
   */
  reopen(messages) {
    setTimeout(() => {
      this.open(messages)
    }, this.backoff.duration())
  }

  /**
   * Fired when request is closed.
   *
   * @api private
   */
  onRequestClose() {
    this.request = undefined
    this.loading = false
  }

  /**
   * Fired when request was successfull.
   *
   * @api private
   */
  onRequestSuccess(res) {
    this.backoff.reset()
    if (!this.connected) {
      this.connected = true
      this.out.emit('connected')
    }
    res.messages.forEach(::this.onMessage)
    this.open()
  }

  /**
   * Fired when request failed.
   *
   * @api private
   */
  onRequestError(messages, err) {
    this.out.emit('error', err)
    if (this.connected &&
      this.backoff.attempts > this.options.disconnectedAfter) {
      this.connected = false
      this.out.emit('disconnected')
    }
    this.reopen(messages)
  }

  /**
   * Fired on every new received message.
   *
   * @api private
   */
  onMessage(message) {
    this.out.emit('message', message)

    if (message.type === 'ack') {
      this.in.emit(`ack:${message.id}`, message)
      return
    }

    this.out.emit('data', message.data)

    // We got a user message, lets schedule an confirmation.
    this.multiplexer.add({
      type: 'ack',
      id: message.id,
      client: this.options.id,
      sender: this.options.user,
      recipient: 'server'
    })
  }

  /**
   * Fired when multiplexer did a clean up.
   *
   * @api private
   */
  onDrain(messages) {
    if (this.request) this.request.abort()
    this.open(messages)
  }

  /**
   * Emits error on out channel.
   *
   * @api private
   */
  onError(err) {
    if (err) this.out.emit('err', err)
  }
}
