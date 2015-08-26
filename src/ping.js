/**
 * Sends ping messages if no message has been received in defined interval.
 */
export default function ping(client, interval) {
  let intervalId
  let last = Date.now()

  client.on('connected', () => {
    intervalId = setInterval(() => {
      if (Date.now() - last > interval) {
        client.send({type: 'ping'})
      }
    }, interval)
  })

  client.on('message', () => {
    last = Date.now()
  })

  client.on('disconnected', () => {
    clearInterval(intervalId)
  })
}