const request = require('request-promise')
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
    promises.push(readinessCheck('pm'))
    promises.push(readinessCheck('ne'))
    promises.push(readinessCheck('mon'))
    promises.push(readinessCheck('wf'))

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
        .then(data => {
            logger.trace(data);
            return readinessCheck('pm')
        })
        .then(data => {
            logger.trace(data);
            return readinessCheck('ne')
        })
        .then(data => {
            logger.trace(data);
            return readinessCheck('mon')
        })
        .then(data => {
            logger.trace(data);
            return readinessCheck('sec')
        })
        .then(data => {
            logger.trace(data);
            return readinessCheck('wf')
        })
        .then(data => logger.trace(data))
        .catch(err => {
        	logger.error(err)
        	throw err;
        })

}

function readinessCheck(_serviceShortName) {
    let url = `${_serviceShortName}/health/ready`
    if (_serviceShortName == "user") url = 'rbac/health/ready'
    if (_serviceShortName == "wf") url = 'workflow/health/ready'
    url = `${config.get(_serviceShortName)}/${url}`
    logger.trace(`Calling readiness url for ${_serviceShortName.toUpperCase()} :: ${url}`);
    return request({
    	"uri": url,
    	"headers": {
    		"TxnId": Date.now()
    	}
    })
    .then(_ => {
      if (_serviceShortName == 'user') return Promise.resolve("User Management is connected.")
      if (_serviceShortName == 'sm') return Promise.resolve("Service Manager is connected.")
      if (_serviceShortName == 'pm') return Promise.resolve("Partner Manager is connected.")
      if (_serviceShortName == 'ne') return Promise.resolve("Notification Engine is connected.")
      if (_serviceShortName == 'mon') return Promise.resolve("Monitoring is connected.")
      if (_serviceShortName == 'sec') return Promise.resolve("Security module is connected.")
      if (_serviceShortName == 'wf') return Promise.resolve("Workflow service is connected.")
    }, _error => {
      if (_serviceShortName == 'user') return Promise.reject("Unable to reach User Management")
      if (_serviceShortName == 'sm') return Promise.reject("Unable to reach Service Manager")
      if (_serviceShortName == 'pm') return Promise.reject("Unable to reach Partner Manager")
      if (_serviceShortName == 'ne') return Promise.reject("Unable to reach Notification Engine")
      if (_serviceShortName == 'mon') return Promise.reject("Unable to reach Monitoring")
      if (_serviceShortName == 'sec') return Promise.reject("Unable to reach Security module")
      if (_serviceShortName == 'wf') return Promise.reject("Unable to reach Workflow service")
    })
}

function dsFileImportStatusHandler(req, res) {
    logger.debug('Received fileInput Status');
    logger.debug(req.body);
    Object.keys(global.socketClients).forEach(key => {
        if (global.socketClients[key].handshake.query.userId == req.body.userId) {
            logger.debug('Sending to ' + req.body.userId + ' on channel ' + 'file-' + req.params.action);
            global.socketClients[key].emit('file-' + req.params.action, req.body);
        }
    });
    res.json({ message: 'ok thanks' });
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