import expect from 'expect.js'
import request from '../src/request'
import noop from 'lodash/utility/noop'

describe('request()', () => {
  describe('should return proper object', () => {
    let req = request({onClose: noop, onError: noop, timeout: 100})
    expect(req).to.be.an(Object)
    expect(req.close).to.be.a(Function)
  })

  it('should call close and error callbacks', (done) => {
    let closed
    request({
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
      timeout: 100
    })
  })

  it('should issue a timeout', (done) => {
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
      },
      timeout: 1
    })
  })

  it('should call onClose when .close()', (done) => {
    let closed
    request({
      onClose: () => {
        closed = true
      },
      timeout: 100
    }).close()
    expect(closed).to.be(true)
  })
})