export default class Package {
  constructor(messages, options) {
    this.messages = messages
    this.options = options
    // We need to set them every time because those options could have changed.
    messages.forEach(message => {
      message.set({
        client: options.id,
        sender: options.user
      })
    })
  }

  toJSON() {
    return {
      client: this.options.id,
      user: this.options.user,
      messages: this.messages
    }
  }
}
