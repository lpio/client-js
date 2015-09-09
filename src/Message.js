import uid from 'get-uid'

/**
 * Build a message.
 *
 * @api private
 */
export default class Message {
  constructor(options) {
    this.id = String(options.id || uid())
    this.type = options.type || 'data'
    this.recipient = this.type === 'ack' ? 'server' : options.recipient
    this.data = options.data
  }

  set(options) {
    this.client = options.client
    this.sender = options.sender
    return this
  }

  toJSON() {
    return {
      id: this.id,
      type: this.type,
      recipient: this.recipient,
      data: this.data,
      client: this.client,
      sender: this.sender
    }
  }
}
