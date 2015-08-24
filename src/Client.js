import Emitter from 'emitter-component'
import Backoff from 'backo'

import Multiplexer from './Multiplexer'
import request from './request'

export default class Client extends Emitter {
  static DEFAULTS = {
    id: undefined,
    url: '/lpio',
    disconnectedAfter: 5,
    multiplex: undefined,
    backoff: undefined,
    ackTimeout: 10000
  }

  constructor(options) {
    super()
    this.options = {...options, ...Client.DEFAULTS}
    this.connected = false
    this.multiplexer = new Multiplexer(this.options.multiplex)
    this.multiplexer.on('drain', ::this.onDrain)
    this.backoff = new Backoff(this.options.backoff)
  }

  connect() {
    if (this.connected || this.request) return this
    this.open()
    return this
  }

  send(options, callback) {
    let err

    if (!options.data) err = new Error('Data is undefined.')
    if (!options.recipient) err = new Error('Recipient is undefined.')

    if (err) return setTimeout(callback.bind(null, err))

    let message = {
      id: uid(),
      type: 'user',
      client: this.id,
      sender: this.options.user,
      ...options
    }

    this.multiplexer.add(message)

    if (callback) {
      let timeout = setTimeout(() => {
        this.off(`ack:${message.id}`, callback)
        callback(new Error('Delivery timeout.'))
      }, this.options.ackTimeout)

      this.once(`ack:${message.id}`, () => {
        clearTimeout(timeout)
        callback()
      })
    }
    return this
  }

  open(messages) {
    if (this.request) {
      // Never loose messages, even if right now this situation should
      // not possible, its better to handle them always.
      this.multiplexer.add(messages)
      return
    }

    this.request = request({
      url: this.options.url,
      data: {
        client: this.options.id,
        messages: messages
      },
      success: ::this.onRequestSuccess,
      error: this.onRequestError.bind(this, messages),
      close: ::this.onRequestClose
    })
  }

  reopen(messages) {
    setTimeout(() => {
      this.open(messages)
    }, this.backoff.duration())
  }

  onRequestClose() {
    this.request = undefined
  }

  onRequestSuccess(res) {
    this.backoff.reset()
    if (!this.connected) {
      this.connected = true
      this.emit('connected')
    }
    res.messages.forEach(::this.onMessage)
  }

  onRequestError(messages) {
    if (this.connected &&
      this.backoff.attempts > this.options.disconnectedAfter) {
      this.connected = false
      this.emit('disconnected')
    }
    this.reopen(messages)
  }

  onMessage(message) {
    if (message.type === 'ack') {
      this.emit(`ack:${message.id}`)
      return
    }

    // We got a user message, lets schedule an confirmation.
    this.multiplexer.add({
      type: 'ack',
      id: message.id,
      client: this.id,
      sender: this.options.user
    })
    this.emit('message', message)
  }

  onDrain(messages) {
    this.request.abort()
    this.open(messages)
  }
}

function uid() {
  return String(Math.round(Math.random() * Date.now()))
}
