const request = require('request-promise')
const sh = require("shorthash");
const crypto = require("crypto");

const express = require('express')
var router = express.Router()

const config = require('../config/config.js');

let logger = global.logger

function healthReadyHandler(req, res) {
	return dependencyCheck()
	.then(() => {
		if(global.mongoAppCenterConnected && global.mongoAuthorConnected) return res.status(200).end()
		return res.status(500).end()
	})
	.catch(_e => {
		logger.error(_e)
		return res.status(500).end()
	})
}

function healthLiveHandler(req, res) {
    if(global.mongoAppCenterConnected && global.mongoAuthorConnected) return res.status(200).end()
    return res.status(400).end()
}

function diagnosticHandler(req, res) {
    let promises = [];
    promises.push(readinessCheck('sec'))
    promises.push(readinessCheck('user'))
    promises.push(readinessCheck('sm'))
    // promises.push(readinessCheck('bm'))
    promises.push(readinessCheck('ne'))
    promises.push(readinessCheck('mon'))

    Promise.all(promises)
        .then(
        	_success => res.json(_success),
        	_e => {
            logger.error(_e)
            res.status(400).json({message: _e});
        })
}

function dependencyCheck() {
    return readinessCheck('user')
        .then(data => {
            logger.trace(data);
            return readinessCheck('sm')
        })
        // .then(data => {
        //     logger.trace(data);
        //     return readinessCheck('bm')
        // })
        .then(data => {
            logger.trace(data);
            return readinessCheck('ne')
        })
        .then(data => {
            logger.trace(data);
            return readinessCheck('mon')
        })
        // .then(data => {
        //     logger.trace(data);
        //     return readinessCheck('sec')
        // })
        .then(data => logger.trace(data))
        .catch(err => {
        	logger.error(err)
        	throw err;
        })

}

function readinessCheck(_serviceShortName) {
    let url = `${_serviceShortName}/health/ready`
    if (_serviceShortName == "user") url = 'rbac/health/ready'
    if (_serviceShortName == "bm") url = `${_serviceShortName}/internal/health/ready`
    url = `${config.get(_serviceShortName)}/${url}`
    logger.trace(`Calling readiness url for ${_serviceShortName.toUpperCase()} :: ${url}`);
    return request({
    	"uri": url,
    	"headers": {
    		"TxnId": `GW_${sh.unique(crypto.createHash("md5").update(Date.now().toString()).digest("hex"))}`
    	}
    })
    .then(_ => {
      if (_serviceShortName == 'user') return Promise.resolve("User Management is connected.")
      if (_serviceShortName == 'sm') return Promise.resolve("Service Manager is connected.")
      if (_serviceShortName == 'bm') return Promise.resolve("Partner Manager is connected.")
      if (_serviceShortName == 'ne') return Promise.resolve("Notification Engine is connected.")
      if (_serviceShortName == 'mon') return Promise.resolve("Monitoring is connected.")
      if (_serviceShortName == 'sec') return Promise.resolve("Security module is connected.")
    }, _error => {
      if (_serviceShortName == 'user') return Promise.reject("Unable to reach User Management")
      if (_serviceShortName == 'sm') return Promise.reject("Unable to reach Service Manager")
      if (_serviceShortName == 'bm') return Promise.reject("Unable to reach Partner Manager")
      if (_serviceShortName == 'ne') return Promise.reject("Unable to reach Notification Engine")
      if (_serviceShortName == 'mon') return Promise.reject("Unable to reach Monitoring")
      if (_serviceShortName == 'sec') return Promise.reject("Unable to reach Security module")
    })
}

function dsFileImportStatusHandler(req, res) {
	let txnId = req.headers["TxnId"];
  logger.debug(`[${txnId}] Received fileInput Status :: ${JSON.stringify(req.body)}`);
  Object.keys(global.socketClients).forEach(key => {
    if (global.socketClients[key].handshake.query.userId == req.body.userId) {
      logger.debug(`[${txnId}] Sending to ${req.body.userId} on channel file-${req.params.action}`);
      global.socketClients[key].emit('file-' + req.params.action, req.body);
    }
  });
  res.json({ message: `Ok, thanks!` });
}

module.exports = {
    router: express.Router()
        .get('/health/ready', healthReadyHandler)
        .get('/health/live', healthLiveHandler)
        .get('/diag', diagnosticHandler)
        .put('/fileStatus/:action', dsFileImportStatusHandler),
    e: {
        healthLiveHandler: healthLiveHandler,
        healthReadyHandler: healthReadyHandler,
        diagnosticHandler: diagnosticHandler,
        dependencyCheck: dependencyCheck
    }
}