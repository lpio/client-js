import Emitter from 'emitter-component'
import Backoff from 'backo'
import Multiplexer from 'lpio-multiplexer'
import uid from 'get-uid'
import debug from 'debug'

import request from './request'

let log = debug('lpio')

export default class Client {
  static DEFAULTS = {
    id: undefined,
    user: undefined,
    url: '/lpio',
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
    if (this.connected || this.loading) return this.out

    let err
    if (!this.options.id) err = new Error('Client id is undefined.')
    if (!this.options.user) err = new Error('User is undefined.')
    if (err) {
      setTimeout(this.onError.bind(this, err))
      return this.out
    }

    log('connecting')
    this.disabled = false
    this.multiplexer.on('drain', ::this.onDrain)
    this.pingIntervalId = setInterval(::this.ping, this.options.pingInterval)
    // First thing to do is a ping request, because we can only say for sure
    // we are "connected" when we got a response.
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
    log('disconnected')
    if (connected) this.out.emit('disconnected')
    return this
  }

  /**
   * Schedule a message.
   *
   * @api public
   */
  send(options, callback) {
    if (options.type === 'data') {
      let err
      if (!options.data) err = new Error('Data is undefined.')
      if (!options.recipient) err = new Error('Recipient is undefined.')
      if (err) return setTimeout(callback.bind(null, err))
    }

    let message = this.buildMessage(options)
    log('sending %s', message.type, message)
    this.multiplexer.add(message)
    if (callback) this.subscribeAck(message, callback)
    return this
  }

  /**
   * Create a message.
   *
   * @api private
   */
  buildMessage(options) {
    return {
      id: String(uid()),
      type: 'data',
      client: this.options.id,
      sender: this.options.user,
      ...options
    }
  }

  /**
   * Subscribes ack for message, implements a timeout.
   *
   * @api private
   */
  subscribeAck(message, callback) {
    let timeoutId
    let onAck = () => {
      log('delivered %s', message.type, message)
      clearTimeout(timeoutId)
      callback()
    }
    this.in.once(`ack:${message.id}`, onAck)
    timeoutId = setTimeout(() => {
      log('message timeout', message)
      this.in.off(`ack:${message.id}`, onAck)
      callback(new Error('Delivery timeout.'))
    }, this.options.ackTimeout)
  }

  /**
   * Schedule a ping message.
   *
   * @api private
   */
  ping() {
    this.send({type: 'ping'})
  }

  /**
   * Opens a request and sends messages.
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
  reopen(messages = []) {
    if (this.reopening) return
    this.reopening = true
    let backoff = this.backoff.duration()

    log('reopen in %sms', backoff)

    // We need to have at least one message to get a response fast to trigger
    // "reconnected" event faster.
    if (!messages.length) messages.push(this.buildMessage({type: 'ping'}))

    setTimeout(() => {
      this.reopening = false
      this.open(messages)
    }, backoff)

    if (this.connected && backoff === this.backoff.max) {
      this.connected = false
      this.out.emit('disconnected')
    }
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

    // In case we have got new messages while we where busy with sending previous.
    let messages = this.multiplexer.get()
    this.multiplexer.reset()
    this.open(messages)
  }

  /**
   * Fired when request failed.
   *
   * @api private
   */
  onRequestError(messages, err) {
    log('request error', err)
    this.out.emit('error', err)
    this.reopen(messages)
  }

  /**
   * Fired on every new received message.
   *
   * @api private
   */
  onMessage(message) {
    log('received %s', message.type, message)
    this.out.emit('message', message)

    if (message.type === 'ack') {
      this.in.emit(`ack:${message.id}`, message)
      return
    }

    if (message.data) this.out.emit('data', message.data)

    // Lets schedule an confirmation.
    let ack = this.buildMessage({
      type: 'ack',
      id: message.id,
      recipient: 'server'
    })
    this.multiplexer.add(ack)
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
    if (err) {
      log('error', err)
      this.out.emit('error', err)
    }
  }
}
