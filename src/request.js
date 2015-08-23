/**
 * Creates an XHR request with all specific to lp settings.
 */
export default function request(options) {
  let xhr

  if (window.XMLHttpRequest) {
    xhr = new XMLHttpRequest()
  } else {
    xhr = new ActiveXObject('Microsoft.XMLHTTP')
  }

  xhr.onreadystatechange = function() {
    if (xhr.readyState !== this.DONE) return
    options.complete()
    if (xhr.status === 200) options.success(JSON.parse(xhr.responseText))
    else options.error(xhr)
  }

  xhr.open('POST', options.url, true)
  xhr.setRequestHeader('Content-Type', 'application/json;charset=UTF-8')
  xhr.setRequestHeader('Accept', 'application/json')
  xhr.send(JSON.stringify(options.data))

  return xhr
}