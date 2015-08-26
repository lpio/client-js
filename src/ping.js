/**
 * Sends ping messages if no message has been received in defined interval.
 */
export default function ping(client, interval) {
  let intervalId

  function ping() {
    client.send({type: 'ping'})
  }

  client.on('connected', () => {
    intervalId = setInterval(ping, interval)
  })

  client.on('disconnected', () => {
    clearInterval(intervalId)
  })
}
