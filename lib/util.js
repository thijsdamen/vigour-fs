var http = require('http')
  , https = require('https')
  , through = require('through2')
  , concat = require('concat-stream')
  , ajax = require('vigour-js/browser/network/ajax')

module.exports = exports

exports.url = function(str) {
  return /^https?:\/\//.test(str)
}

exports.defaults = function (options) {
	var defaults = [
			{ k: 'maxTries', v: 1 }
		  , { k: 'retryDelayType', v: 'exp' }
		  , { k: 'retryDelay', v: 500 }
		  , { k: 'retryOn404', v: false }
		  , { k: 'respectRetryAfter', v: true }
		  , { k: 'maxRetryDelay', v: 60000 }
		  , { k: 'timeout', v: 5000 }
		]
		, l = defaults.length
		, i
	for (i = 0; i < l; i += 1) {
		options[defaults[i].k] = options[defaults[i].k] || defaults[i].v
	}
}

exports.readHttp = function (url, options, cb) {
	exports.getRetry(url, options, function (err, throughStream) {
		if (err) {
			cb(err)
		} else {
			throughStream.pipe(concat(function (data) {
				cb(null, data)
			}))
		}
	})
}

exports.readAjax = function (url, options, cb) {
	exports.ajaxRetry(url, options, function (err, data) {
		if (err) {
			cb(err)
		} else {
			cb(null, data)
		}
	})
}

exports.getRetry = function (url, options, cb) {
	exports.retryFactory(exports.get, options)(url, options, cb)
}

exports.ajaxRetry = function (url, options, cb) {
	exports.retryFactory(exports.ajaxGet, options)(url, options, cb)
}

exports.ajaxGet = function (url, options, cb) {
	ajax({
		url: url
		, complete: function (data, xhrProgressEvent) {
			return setupRetry(xhrProgressEvent.target.status
				,	 xhrProgressEvent.target.getResponseHeader('Retry-After')
				, options
				, function (err) {
					if (err) {
						cb(err)
					} else {
						cb(null, data)
					}
				})

		}
		, error: function (err) {
			return cb(err)
		}
	})
}

exports.get = function (url, options, cb) {
	var throughStream = through()
		, callback = once(cb)
		, req = (/^https/.test(url) ? https : http).get(url
			, function (res) {
				res.on('error', callback)
				return setupRetry(res.statusCode
					, res.headers['retry-after']
					, options
					, function (err) {
						if (err) {
							res.resume()
							return callback(err)
						} else {
							res.pipe(throughStream)
							return callback(null, throughStream)
						}
					})
			})
		req.on('socket', function (socket) {
			socket.setTimeout(options.timeout)
			socket.on('timeout', function() {
				req.abort()
			})
		})
		req.on('error', callback)
}

function once (cb) {
	var called = false
	return function () {
		if (called) return
		called = true
		return cb.apply(this, arguments)
	}
}

function setupRetry (statusCode, retryAfter, options, cb) {
	var error
		, parsed
		, diff
		, date
	if (statusCode === 500 || statusCode === 503 || (options.retryOn404 && statusCode === 404)) {
		error = new Error("Remote server error (" + statusCode + ")")
		error.statusCode = statusCode
		error.retry = true
		if (retryAfter) {
			error.retryAfterContent = retryAfter
			parsed = parseInt(retryAfter, 10)
			if (parsed) {
				error.retryAfter = parsed * 1000
			} else {
				parsed = (new Date(retryAfter)).getTime()
				if (parsed) {
					date = new Date()
					diff = parsed - date.getTime()
					if (diff > 0) {
						error.retryAfter = diff
					}
				}
			}
			if (error.retryAfter > options.maxRetryDelay) {
				error.retry = false
				error.message += "; Retry-After delay over maxRetryDelay"
			}
		}
		return cb(error)
	} else if (statusCode === 200) {
		return cb(null)
	} else {
		error = new Error("Error GETting url. StatusCode: " + statusCode)
		error.statusCode = statusCode
		error.retry = false
		return cb(error)
	}
}

exports.retryFactory = function (fn, options) {
	return function () {
		var tryNb = 0
			, args = [].slice.call(arguments)
			, cb = args.pop()

		attempt()

		function attempt () {
			fn.apply(null, args.concat(function (err, throughStream) {
				var error
					, retryDelay
				if (err) {
					if (err.retry) {
						if (tryNb >= options.maxTries) {
							error = err
							error.message += ". Maximum number of attempts reached"
							error.maxTries = options.maxTries
							return cb(error)
						} else {
							if (options.respectRetryAfter && err.retryAfter) {
								retryDelay = err.retryAfter
							} else if (options.retryDelayType === 'exp') {
			          retryDelay = options.retryDelay * Math.pow(2, tryNb)
			        } else if (options.retryDelayType === 'linear') {
			          retryDelay = options.retryDelay * tryNb
			        } else /*if (options.retryDelayType === 'constant') */{ 
			          retryDelay = options.retryDelay
			        }
			        tryNb += 1
			        if (retryDelay > options.maxRetryDelay) {
			        	retryDelay = options.maxRetryDelay
			        }
							setTimeout(attempt, retryDelay)
						}
					} else {
						error = err
						return cb(error)
					}
				} else {
					return cb(null, throughStream)
				}
			}))
		}
	}
}