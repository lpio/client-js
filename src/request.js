/**
 * Creates an XHR request with all specific to lp settings.
 */
export default function request(options) {
  let xhr
  let aborted

  if (window.XMLHttpRequest) xhr = new window.XMLHttpRequest()
  else xhr = new window.ActiveXObject('Microsoft.XMLHTTP')

  xhr.onreadystatechange = () => {
    if (xhr.readyState !== 4) return
    options.close()
    if (xhr.status === 200) options.success(JSON.parse(xhr.responseText))
    else if (!aborted) options.error(xhr)
  }

  xhr.open('POST', options.url, true)
  xhr.setRequestHeader('Content-Type', 'application/json;charset=UTF-8')
  xhr.setRequestHeader('Accept', 'application/json')
  xhr.send(JSON.stringify(options.data))

  return {
    abort: () => {
      aborted = true
      xhr.abort()
    }
  }
}
