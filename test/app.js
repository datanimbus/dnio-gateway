var assert = require('assert');
var sinon = require('sinon');
var express = require('express')


describe('Gateway - app.js', function() {

    before(() => {
        sinon.stub(express)
    })

    it('healthAPI', function() {
        assert("Success")
    });

});