/**
 * Creates an XHR request with all specific to LP settings.
 */
export default function request(options) {
  let closed = false
  let xhr

  if (window.XMLHttpRequest) xhr = new window.XMLHttpRequest()
  else xhr = new window.ActiveXObject('Microsoft.XMLHTTP')

  function close() {
    closed = true
    xhr.abort()
    options.onClose()
  }

  let timeoutId = setTimeout(() => {
    if (closed) return
    close()
    options.onError(new Error('Request timeout.'))
  }, options.timeout)

  xhr.onreadystatechange = () => {
    if (xhr.readyState !== 4 || closed) return
    clearTimeout(timeoutId)
    closed = true
    options.onClose()
    if (xhr.status === 200) options.onSuccess(JSON.parse(xhr.responseText))
    else {
      let err = new Error(xhr.responseText)
      err.status = xhr.status
      options.onError(err)
    }
  }

  xhr.onerror = err => {
    if (closed) return
    clearTimeout(timeoutId)
    closed = true
    options.onError(err)
  }

  xhr.open('POST', options.url, true)
  xhr.setRequestHeader('Content-Type', 'application/json;charset=UTF-8')
  xhr.setRequestHeader('Accept', 'application/json')
  xhr.send(JSON.stringify(options.data))

  return {close}
}
