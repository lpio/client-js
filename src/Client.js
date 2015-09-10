import Emitter from 'emitter-component'
import Backoff from 'backo'
import Multiplexer from 'lpio-multiplexer'
import debug from 'debug'

import request from './request'
import Message from './Message'
import Package from './Package'

let log = debug('lpio')

export default class Client {
  static DEFAULTS = {
    id: undefined,
    user: undefined,
    url: '/lpio',
    multiplex: undefined,
    backoff: undefined,
    ackTimeout: 10000,
    responseTimeout: 25000
  }

  constructor(options) {
    this.options = { ...Client.DEFAULTS, ...options}
    this.connected = false
    this.disabled = true
    this.backoff = new Backoff(this.options.backoff)
    this.multiplexer = new Multiplexer(this.options.multiplex)
    this.out = new Emitter()
    this.in = new Emitter()
    this.in.on('option', ::this.onOption)
  }

  /**
   * Connect the client.
   *
   * @api public
   */
  connect() {
    if (this.connected || this.loading) return this.out

    let err
    if (!this.options.id) err = new Error('Option "id" is undefined.')
    if (!this.options.user) err = new Error('Option "user" is undefined.')
    if (err) {
      setTimeout(this.onError.bind(this, err))
      return this.out
    }

    log('connecting')
    this.disabled = false
    this.multiplexer.on('drain', ::this.onDrain)
    this.open()
    return this.out
  }

  /**
   * Disconnect the client.
   *
   * @api public
   */
  disconnect() {
    this.disabled = true
    this.multiplexer.off('drain')
    if (this.request) this.request.close()
    this.onDisconnected()
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
      if (!options.data) err = new Error('Undefined property "data"')
      if (!options.recipient) err = new Error('Undefined property "recipient"')
      if (err) return setTimeout(callback.bind(null, err))
    }

    let message = new Message(options)
    log('sending %s', message.type, message)
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
      data: new Package(messages, this.options),
      onSuccess: ::this.onRequestSuccess,
      onError: err => {
        // Put unsent messages back to multiplexer in order to not to loose them.
        this.multiplexer.add(messages)
        this.onRequestError(err)
      },
      onClose: ::this.onRequestClose,
      timeout: this.options.responseTimeout
    })
  }

  /**
   * Reopens request using backoff.
   *
   * @api private
   */
  reopen() {
    if (this.reopening) return
    this.reopening = true
    let backoff = this.backoff.duration()

    log('reopen in %sms', backoff)

    // We need to have at least one message to get a response fast to trigger
    // "reconnected" event faster.
    // XXX we need a new way to find out when we are reconnected quickly
    // if (!messages.length) messages.push(this.buildMessage({type: 'ping'}))

    setTimeout(() => {
      this.reopening = false
      this.open()
    }, backoff)

    this.onDisconnected(backoff)
  }

  /**
   * Set connected to false and emit disconnected if we are disconnected.
   *
   * @api private
   */
  onDisconnected(backoff) {
    if (!this.connected) return
    if (backoff !== undefined && backoff < this.backoff.max) return
    // We need to unset the id in order to receive an immediate response with new
    // client id when reconnecting.
    this.options.id = undefined
    this.connected = false
    log('disconnected')
    this.out.emit('disconnected')
  }

  /**
   * Set connected to true and emit connected if we are connected.
   *
   * @api private
   */
  onConnected() {
    if (this.connected) return
    this.connected = true
    this.out.emit('connected')
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
    this.onConnected()
    this.backoff.reset()
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
  onRequestError(err) {
    log('request error', err)
    this.out.emit('error', err)
    if (err.status === 401) this.onUnauthorized()
    else this.reopen()
  }

  /**
   * Client is not authorized any more.
   *
   * @api private
   */
  onUnauthorized() {
    this.out.emit('unauthorized')
    this.disconnect()
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
    // We have got an option.
    else if (message.type === 'option') {
      this.in.emit('option', {name: message.id, value: message.data})
      return
    }


    if (message.type === 'data' && message.data) this.out.emit('data', message.data)

    // Lets schedule an confirmation.
    let ack = new Message({
      type: 'ack',
      id: message.id
    })
    this.multiplexer.add(ack)
  }

  /**
   * We received an option.
   *
   * @api private
   */
  onOption({name, value}) {
    if (name === 'client') {
      this.options.id = value
    }
  }

  /**
   * Fired when multiplexer did a clean up.
   *
   * @api private
   */
  onDrain(messages) {
    if (this.request) this.request.close()
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
