import expect from 'expect.js'
import request from '../src/request'
import noop from 'lodash/utility/noop'

describe('request()', () => {
  it('should return proper object', () => {
    let req = request({onClose: noop, onError: noop, timeout: 100})
    expect(req).to.be.an(Object)
    expect(req.close).to.be.a(Function)
  })

  it('should call close and error callbacks', done => {
    let closed
    request({
      url: '/something',
      onClose: () => {
        closed = true
      },
      onError: err => {
        expect(closed).to.be(true)
        expect(err).to.be.an(Error)
        expect(err.message).to.be('NOT FOUND')
        expect(err.status).to.be(404)
        done()
      },
      timeout: 1500
    })
  })

  it('should issue a timeout', done => {
    let closed
    request({
      onClose: () => {
        closed = true
      },
      onError: err => {
        expect(closed).to.be(true)
        expect(err).to.be.an(Error)
        expect(err.message).to.be('Response timeout.')
        expect(err.status).to.be(408)
        done()
      }
    })
  })

  it('should call onClose when .close()', () => {
    let closed
    request({
      onClose: () => {
        closed = true
      },
      timeout: 100
    }).close()
    expect(closed).to.be(true)
  })

  it('should call succes callback', done => {
    let closed
    request({
      url: 'http://localhost:3000/lpio',
      onError: err => console.log(err.message),
      onClose: () => {
        closed = true
      },
      onSuccess: (res) => {
        expect(res).to.be.an(Object)
        done()
      },
      timeout: 1000,
      data: {messages: []}
    })
  })
})