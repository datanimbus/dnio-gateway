var assert = require('assert');
var sinon = require('sinon');
var mockExpress = require('sinon-express-mock');

var request = require('request-promise')

describe('Testing - routes/diag.router.js', function() {

    const req = mockExpress.mockReq()
    const res = mockExpress.mockRes()

    global.logger = {
        debug: _s => {},
        info: _s => {},
        error: _s => {},
    }

    global.mongoConnectionAuthor = {
        collection: _s => {}
    }

    var diag = require('../routes/diag.route');

    afterEach(() => {
        sinon.restore();
    })

    it('/heath/ready', function() {
        diag.exposedMethods.healthReadyHandler(req, res)
    });

    it('/heath/live 200 OK', function() {
        global.mongoConnectionAuthor.collection = _s => {
            return {
                count: _s => Promise.resolve()
            }
        }
        diag.exposedMethods.healthLiveHandler(req, res)
    });

    it('/heath/live 400 Bad Request', function() {
        global.mongoConnectionAuthor.collection = _s => {
            return {
                count: _s => Promise.reject()
            }
        }
        diag.exposedMethods.healthLiveHandler(req, res)
    });

    it('/diag 200 OK', function() {
        sinon.stub(request, "get").callsFake(sinon.fake.resolves())
        diag.exposedMethods.diagnosticHandler(req, res)
    });

    it('/diag 400 Bad Request', function() {
        sinon.stub(request, "get").callsFake(sinon.fake.rejects())
        diag.exposedMethods.diagnosticHandler(req, res)
    });

});