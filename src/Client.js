import Emitter from 'emitter-component'
import Backoff from 'backo'
import Multiplexer from 'lpio-multiplexer-js'
import uid from 'get-uid'

import request from './request'

let noop = () => {}

export default class Client extends Emitter {
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
    super()
    this.options = { ...Client.DEFAULTS, ...options}
    this.connected = false
    this.disabled = true
    this.backoff = new Backoff(this.options.backoff)
    this.multiplexer = new Multiplexer(this.options.multiplex)
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
      this.emit('error', err)
      return this
    }
    this.disabled = false
    this.multiplexer.on('drain', ::this.onDrain)

    this.pingIntervalId = setInterval(::this.ping, this.options.pingInterval)

    // First thing to do is a ping request, because we can only safe for sure
    // we are connected when we got a response.
    this.ping()

    return this
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
    if (connected) this.emit('disconnected')
  }

  /**
   * Send a message.
   *
   * @api public
   */
  send(options, callback = noop) {
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
    this.once(`ack:${message.id}`, onAck)
    timeoutId = setTimeout(() => {
      this.off(`ack:${message.id}`, onAck)
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
      this.emit('connected')
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
    this.emit('error', err)
    if (this.connected &&
      this.backoff.attempts > this.options.disconnectedAfter) {
      this.connected = false
      this.emit('disconnected')
    }
    this.reopen(messages)
  }

  /**
   * Fired on every new received message.
   *
   * @api private
   */
  onMessage(message) {
    this.emit('message', message)

    if (message.type === 'ack') {
      this.emit(`ack:${message.id}`, message)
      return
    }

    this.emit('data', message.data)

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
}
