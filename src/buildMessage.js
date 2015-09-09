import uid from 'get-uid'

/**
 * Build a message.
 *
 * @api private
 */
export default function buildMessage(message, options) {
  let recipient

  if (message.type === 'ack') {
    recipient = 'server'
  }

  return {
    id: String(uid()),
    type: 'data',
    client: options.id,
    sender: options.user,
    recipient,
    ...message
  }
}
