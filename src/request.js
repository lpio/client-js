/**
 * Creates an XHR request with all specific to lp settings.
 */
export default function request(options) {
  let xhr

  if (window.XMLHttpRequest) xhr = new window.XMLHttpRequest()
  else xhr = new window.ActiveXObject('Microsoft.XMLHTTP')

  xhr.onreadystatechange = () => {
    if (xhr.readyState !== 4) return
    options.complete()
    if (xhr.status === 200) options.success(JSON.parse(xhr.responseText))
    else options.error(xhr)
  }

  xhr.open('POST', options.url, true)
  xhr.setRequestHeader('Content-Type', 'application/json;charset=UTF-8')
  xhr.setRequestHeader('Accept', 'application/json')
  xhr.send(JSON.stringify(options.data))
}