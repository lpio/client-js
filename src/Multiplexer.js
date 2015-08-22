import Emitter from 'emitter-component'

export default class Multiplexer extends Emitter {
  static DEFAULTS = {
    // Interval in ms "drain" will be periodically emitted.
    duration: 200
  }

  constructor(options) {
    this.options = {...options, ...Multiplexer.DEFAULTS}
    this.reset()
    this.intervalId = setInterval(::this.drain, this.options.duration)
  }

  /**
   * Get buffer.
   *
   * @api public
   */
  get() {
    return this.buffer
  }

  /**
   * Add data to the buffer.
   *
   * @api public
   */
  add(data) {
    if (Array.isArray(data)) {
      this.buffer.push.apply(this.buffer, data)
      return this
    }
    this.buffer.push(data)
    return this
  }

  /**
   * Reset buffer.
   *
   * @api public
   */
  reset() {
    this.buffer = []
    return this
  }

  /**
   * Destroy multiplexer.
   *
   * @api public
   */
  destroy() {
    clearInterval(this.intervalId)
    this.removeAllListeners()
    return this
  }

  /**
   * Reset and emit "drain"
   *
   * @api private
   */
  drain() {
    let {buffer} = this
    this.reset()
    this.emit('drain', buffer)
  }
}
