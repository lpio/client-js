import expect from 'expect.js'
import Client from '../src/Client'

const URL = 'http://localhost:3000/lpio'

describe('Client:', () => {
  function expectInitialState(client) {
    expect(client.id).to.be(undefined)
    expect(client.connected).to.be(false)
    expect(client.disabled).to.be(true)
  }

  describe('new Client', () => {
    let client = new Client({url: URL})
    it('should have proper initial state', () => expectInitialState(client))
  })

  describe('.connect', () => {
    it('should fire proper events on connect', done => {
      let client = new Client({url: URL})
      let channel = client.connect()
      let success
      channel.on('success', () => success = true)
      channel.on('connected', () => {
        expect(success).to.be.ok()
        expect(client.id).to.be.a('string')
        channel.on('set:id', id => {
          expect(id).to.be.a('string')
          client.disconnect()
        })
      })
      channel.on('disconnected', () => {
        expectInitialState(client)
        done()
      })
    })
  })

  describe('.send', () => {
    it('should call back with error when message has no data', done => {
      let client = new Client({url: URL})
      let channel = client.connect()
      channel.on('connected', () => {
        client.send(undefined, err => {
          expect(err).to.be.an(Error)
          client.disconnect()
          done()
        })
      })
    })

    it('should get deliver timeout error', done => {
      let client = new Client({url: URL})
      let channel = client.connect()
      channel.on('connected', () => {
        client.send({data: 'something'}, err => {
          expect(err).to.be.an(Error)
          expect(err.message).to.be('Delivery timeout.')
          client.disconnect()
          done()
        })
      })
    })

    it('should not pass error', done => {
      let client = new Client({url: URL})
      let channel = client.connect()
      let messageEmitted, dataEmitted
      channel.on('message', () =>  messageEmitted = true)
      channel.on('data', () => dataEmitted = true)
      channel.on('connected', () => {
        client.send({data: 'something', channel: 'c'}, err => {
          expect(messageEmitted).to.be.ok()
          expect(dataEmitted).to.not.be.ok()
          expect(err).to.be(undefined)
          client.disconnect()
          done()
        })
      })
    })
  })

  describe('error handling', () => {
    it('should emit error, when some event handler throws', done => {
      let message = 'Something bad in user land happend.'
      let client = new Client({url: URL})
      let channel = client.connect()
      channel.on('error', err => {
        expect(err).to.be.an(Error)
        expect(err.message).to.be(message)
        done()
      })
      channel.on('connected', () => {
        throw new Error(message)
      })
    })
  })
})
