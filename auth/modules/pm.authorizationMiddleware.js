let commonAuthZMw = require("./common.authorizationMiddleware");
let authUtil = require("./../../util/authUtil");
let logger = global.logger;

function isPMapiInvalid(req) {
    let accessLevel = req.user.accessControl.accessLevel;
    let pathSegment = req.path.split("/");
    // let secPMApi = ["/bm/{partnerId}/secret/enc", "/bm/{partnerId}/secret/dec/{secretId}", "/bm/{partnerId}/secret/{secretId}"];
    // let secPMApiFlag = secPMApi.some(_a => authUtil.compareUrl(`/api/a/sec${_a}`, req.path));
    if (req.user.isSuperAdmin) return false;
    let appsAdmin = [];
    if (accessLevel == "Selected") {
        appsAdmin = req.user.accessControl.apps ? req.user.accessControl.apps.map(obj => obj._id) : [];
    }
    if (authUtil.compareUrl("/api/a/bm/flow", req.path) || authUtil.compareUrl("/api/a/bm/flow/count", req.path)  || authUtil.compareUrl("/api/a/bm/flow/status/count", req.path)) {
        if (req.method === "GET") {
            let permissionApp = req.user.roles.filter(_r => (_r.id === "PMPFMBC" || _r.id === "PVPFMB") && _r.entity == "PM").map(_r => _r.app);
            let manageGroupApps = req.user.roles.filter(_r => (_r.id === "PMGAP" || _r.id === "PVGAP") && _r.entity === "GROUP").map(_r => _r.app);
            let partnerManageTabApps = req.user.roles.filter(_r => (_r.id === "PMPM") && _r.entity.startsWith("PM")).map(_r => _r.app);
            let exceptionFlow = req.user.roles.filter(_r => (_r.id === "PMPFMBC" || _r.id === "PMPFMBC" || _r.id === "PVPFMB") && _r.entity.startsWith("FLOW_")).map(_r => _r.entity.substr(5));
            let noFlow = req.user.roles.filter(_r => (_r.id === "PNFB") && _r.entity.startsWith("FLOW_")).map(_r => _r.entity.substr(5));
            let appList = permissionApp.concat(manageGroupApps).concat(partnerManageTabApps);
            let customFilter = {
                "$and": [
                    {
                        $or: [
                            { app: { "$in": appsAdmin } },
                            {
                                $and: [
                                    {
                                        $or: [
                                            { app: { "$in": appList } },
                                            { runningFlow: { $in: exceptionFlow } },
                                            { nextFlow: { $in: exceptionFlow } },
                                            { _id: { $in: exceptionFlow } }
                                        ]
                                    },
                                    { runningFlow: { $nin: noFlow } },
                                    { nextFlow: { $nin: noFlow } },
                                    { _id: { $nin: noFlow } }
                                ]
                            }
                        ]
                    }
                ]
            };
            if (req.query.filter) {
                let oldFilter = req.query.filter;
                customFilter["$and"].push((typeof oldFilter === "object" ? oldFilter : JSON.parse(oldFilter)));
            }
            req.query.filter = JSON.stringify(customFilter);
            if (appsAdmin.concat(permissionApp).length == 0 && exceptionFlow.length === 0 && manageGroupApps.length > 0) {
                req.query.select = "_id,name,app,partner,_metadata";
            }
            return false;
        }
        if (req.method === "POST") {
            let permissionApp = req.user.roles.filter(_r => (_r.id === "PMPFMBC") && _r.entity === "PM").map(_r => _r.app);
            return appsAdmin.concat(permissionApp).indexOf(req.body.app) == -1;
        }
    }
    if (authUtil.compareUrl("/api/a/bm/flow/{id}/deploy", req.path)) {
        let permissionApp = [];
        let allowedPermission = [];
        let appAdminFlag = appsAdmin.indexOf(req.apiDetails.app) > -1;
        if (appAdminFlag) return false;
        let noPermissionFlow = req.user.roles.filter(_r => _r.id == "PNPFM" && _r.entity.startsWith("FLOW_")).map(_r => _r.entity.substr(5));
        if (noPermissionFlow.indexOf(pathSegment[5]) > -1) return true;
        if (req.method === "PUT") {
            allowedPermission = ["PMPFPD"];
        }
        permissionApp = req.user.roles.filter(_r => (allowedPermission.indexOf(_r.id) > -1) && _r.entity === "PM").map(_r => _r.app);
        let manageGroupApps = req.user.roles.filter(_r => (_r.id === "PMGAP" || _r.id === "PVGAP") && _r.entity === "GROUP").map(_r => _r.app);
        let appList = permissionApp.concat(manageGroupApps);
        let invalidFlag = appsAdmin.concat(appList).indexOf(req.apiDetails.app) == -1;
        if (!invalidFlag) return false;
        let roleEntities = req.apiDetails.relatedFlows.map(_r => `FLOW_${_r}`);
        let allowedFlowPermission = [];
        if (req.method === "PUT") {
            allowedFlowPermission = ["PMPFMBC", "PMPFMBU", "PVPFM"];
        }
        return !req.user.roles.find(_r => roleEntities.indexOf(_r.entity) > -1 && allowedFlowPermission.indexOf(_r.id) > -1 && _r.app === req.apiDetails.app);
    }
    if (authUtil.compareUrl("/api/a/bm/flow/{app}/startAll", req.path) || authUtil.compareUrl("/api/a/bm/flow/{app}/stopAll", req.path)) {
        let app = pathSegment[5];
        return !(appsAdmin.indexOf(app) > -1);
    }
    if (authUtil.compareUrl("/api/a/bm/flow/{id}/stop", req.path) || authUtil.compareUrl("/api/a/bm/flow/{id}/start", req.path)) {
        let permissionApp = [];
        let allowedPermission = [];
        let appAdminFlag = appsAdmin.indexOf(req.apiDetails.app) > -1;
        if (appAdminFlag) return false;
        let noPermissionFlow = req.user.roles.filter(_r => _r.id == "PNPFM" && _r.entity.startsWith("FLOW_")).map(_r => _r.entity.substr(5));
        if (noPermissionFlow.indexOf(pathSegment[5]) > -1) return true;
        if (req.method === "PUT") {
            allowedPermission = ["PMPFPS"];
        }
        permissionApp = req.user.roles.filter(_r => (allowedPermission.indexOf(_r.id) > -1) && _r.entity === "PM").map(_r => _r.app);
        let manageGroupApps = req.user.roles.filter(_r => (_r.id === "PMGAP" || _r.id === "PVGAP") && _r.entity === "GROUP").map(_r => _r.app);
        let appList = permissionApp.concat(manageGroupApps);
        let invalidFlag = appsAdmin.concat(appList).indexOf(req.apiDetails.app) == -1;
        if (!invalidFlag) return false;
        let roleEntities = req.apiDetails.relatedFlows.map(_r => `FLOW_${_r}`);
        let allowedFlowPermission = [];
        if (req.method === "PUT") {
            allowedFlowPermission = ["PMPFMBC", "PMPFMBU", "PVPFM"];
        }
        return !req.user.roles.find(_r => roleEntities.indexOf(_r.entity) > -1 && allowedFlowPermission.indexOf(_r.id) > -1 && _r.app === req.apiDetails.app);
    }
    if (authUtil.compareUrl("/api/a/bm/flow/{id}", req.path) || authUtil.compareUrl("/api/a/bm/flow/{id}/{action}", req.path)) {
        let permissionApp = [];
        let allowedPermission = [];
        let appAdminFlag = appsAdmin.indexOf(req.apiDetails.app) > -1;
        if (appAdminFlag) return false;
        let noPermissionFlow = req.user.roles.filter(_r => _r.id == "PNPFM" && _r.entity.startsWith("FLOW_")).map(_r => _r.entity.substr(5));
        if (noPermissionFlow.indexOf(pathSegment[5]) > -1) return true;
        if (req.method === "GET") {
            allowedPermission = ["PMPFMBU", "PMPFMBC", "PVPFM"];
        } else if (req.method === "PUT") {
            allowedPermission = ["PMPFMBU"];
        }
        else if (req.method === "DELETE") {
            allowedPermission = ["PMPFMBD"];
        }
        permissionApp = req.user.roles.filter(_r => (allowedPermission.indexOf(_r.id) > -1) && _r.entity === "PM").map(_r => _r.app);
        let manageGroupApps = req.user.roles.filter(_r => (_r.id === "PMGAP" || _r.id === "PVGAP") && _r.entity === "GROUP").map(_r => _r.app);
        let appList = permissionApp.concat(manageGroupApps);
        let invalidFlag = appsAdmin.concat(appList).indexOf(req.apiDetails.app) == -1;
        if (!invalidFlag) return false;
        let roleEntities = req.apiDetails.relatedFlows.map(_r => `FLOW_${_r}`);
        let allowedFlowPermission = [];
        if (req.method === "GET") {
            allowedFlowPermission = ["PVPFMB", "PMPFMBC", "PMPFMBU"];
        } else if (req.method === "PUT") {
            allowedFlowPermission = ["PMPFMBU"];
        }
        return !req.user.roles.find(_r => roleEntities.indexOf(_r.entity) > -1 && allowedFlowPermission.indexOf(_r.id) > -1 && _r.app === req.apiDetails.app);
    }
    if (authUtil.compareUrl("/api/a/bm/dataFormat", req.path) || authUtil.compareUrl("/api/a/bm/dataFormat/count", req.path)) {
        if (req.method === "GET") {
            let exceptionDF = req.user.roles.filter(_r => (_r.id === "PMDF" || _r.id === "PVDF") && _r.entity.startsWith("DF_")).map(_r => _r.entity.substr(3));
            let dfNotallowed = req.user.roles.filter(_r => (_r.id === "PNDF") && _r.entity.startsWith("DF_")).map(_r => _r.entity.substr(3));
            let permissionApp = req.user.roles.filter(_r => (_r.id === "PMDF" || _r.id === "PVDF") && _r.entity === "DF").map(_r => _r.app);
            let manageGroupApps = req.user.roles.filter(_r => (_r.id === "PMGADF" || _r.id === "PVGADF") && _r.entity === "GROUP").map(_r => _r.app);
            let customFilter = {
                "$and": [
                    {
                        $or: [
                            { app: { "$in": appsAdmin.concat(manageGroupApps) } },
                            {
                                $and: [
                                    {
                                        $or: [
                                            { app: { $in: permissionApp } },
                                            { _id: { $in: exceptionDF } }
                                        ]
                                    },
                                    { _id: { $nin: dfNotallowed } }
                                ]
                            }
                        ]
                    }
                ]
            };
            if (req.query.filter) {
                let oldFilter = req.query.filter;
                customFilter["$and"].push(typeof oldFilter === "object" ? oldFilter : JSON.parse(oldFilter));
                // req.query.filter = JSON.stringify({ '$and': [typeof oldFilter === 'object' ? oldFilter : JSON.parse(oldFilter), { $or: [{ app: { '$in': appsAdmin.concat(permissionApp) } }, { _id: { $in: exceptionDF } }] }, { _id: { $nin: dfNotallowed } }] });
            }
            //  else {
            //     req.query.filter = { $and: [{ $or: [{ app: { '$in': appsAdmin.concat(permissionApp) } }, { _id: { $in: exceptionDF } }] }, { _id: { $nin: dfNotallowed } }] };
            //     req.query.filter = JSON.stringify(req.query.filter);
            // }
            req.query.filter = JSON.stringify(customFilter);
            if (appsAdmin.concat(permissionApp).length == 0 && exceptionDF.length === 0 && manageGroupApps.length > 0) {
                req.query.select = "_id,name,app,_metadata";
            }
            return false;
        }
        if (req.method === "POST") {
            let permissionApp = req.user.roles.filter(_r => _r.id === "PMDF" && _r.entity === "DF").map(_r => _r.app);
            return appsAdmin.concat(permissionApp).indexOf(req.body.app) == -1;
        }
    }
    if (authUtil.compareUrl("/api/a/bm/dataFormat/{id}", req.path)) {
        let permissionApp = [];
        let allowedPermission = [];
        let appAdminFlag = appsAdmin.indexOf(req.apiDetails.app) > -1;
        if (appAdminFlag) return false;
        if (req.method === "GET") {
            allowedPermission = ["PMDF", "PVDF"];
        } else if (req.method === "PUT" || req.method === "DELETE") {
            allowedPermission = ["PMDF"];
        }
        permissionApp = req.user.roles.filter(_r => (allowedPermission.indexOf(_r.id) > -1) && _r.entity === "DF").map(_r => _r.app);
        let appFlag = appsAdmin.concat(permissionApp).indexOf(req.apiDetails.app) == -1;
        if (!appFlag) return false;
        if (req.method === "GET") {
            let exceptionDF = req.user.roles.filter(_r => (_r.id === "PMDF" || _r.id === "PVDF") && _r.entity.startsWith("DF_")).map(_r => _r.entity.substr(3));
            return exceptionDF.indexOf(pathSegment[5]) === -1;
        } else if (req.method === "PUT") {
            let exceptionDF = req.user.roles.filter(_r => (_r.id === "PMDF") && _r.entity.startsWith("DF_")).map(_r => _r.entity.substr(3));
            return exceptionDF.indexOf(pathSegment[5]) === -1;
        }
        return true;
    }
    if (authUtil.compareUrl("/api/a/bm/agentRegistry", req.path) || authUtil.compareUrl("/api/a/bm/agentRegistry/count", req.path)) {
        if (req.method === "GET") {
            let permissionApp = req.user.roles.filter(_r => (_r.id === "PMABC" || _r.id === "PMABU" || _r.id === "PVAB") && _r.entity == "AGENT").map(_r => _r.app);
            let manageGroupApps = req.user.roles.filter(_r => (_r.id === "PMGAP" || _r.id === "PVGAP") && _r.entity === "GROUP").map(_r => _r.app);
            let exceptionAgent = req.user.roles.filter(_r => (_r.id === "PMABC" || _r.id === "PMABU" || _r.id === "PVAB") && _r.entity.startsWith("AGENT_")).map(_r => _r.entity.substr(6));
            let noAgent = req.user.roles.filter(_r => (_r.id === "PNAB") && _r.entity.startsWith("AGENT_")).map(_r => _r.entity.substr(6));
            let appList = permissionApp.concat(manageGroupApps);
            let customFilter = {
                "$and": [
                    {
                        $or: [
                            { app: { "$in": appsAdmin } },
                            {
                                $and: [
                                    {
                                        $or: [
                                            { app: { "$in": appList } },
                                            { _id: { $in: exceptionAgent } }
                                        ]
                                    },
                                    { _id: { $nin: noAgent } }
                                ]
                            }
                        ]
                    }
                ]
            };
            if (req.query.filter) {
                let oldFilter = req.query.filter;
                customFilter["$and"].push((typeof oldFilter === "object" ? oldFilter : JSON.parse(oldFilter)));
            }
            req.query.filter = JSON.stringify(customFilter);
            if (appsAdmin.concat(permissionApp).length == 0 && exceptionAgent.length === 0 && manageGroupApps.length > 0) {
                req.query.select = "_id,name,app,partner,_metadata";
            }
            return false;
        }
        if (req.method === "POST") {
            let permissionApp = req.user.roles.filter(_r => _r.id === "PMABC" && _r.entity === "AGENT").map(_r => _r.app);
            return appsAdmin.concat(permissionApp).indexOf(req.body.app) == -1;
        }
    }
    if (authUtil.compareUrl("/api/a/bm/agentMonitoring", req.path) || authUtil.compareUrl("/api/a/bm/agentMonitoring/count", req.path)) {
        if (req.method === "GET") {
            let permissionApp = req.user.roles.filter(_r => (_r.id === "PMABC" || _r.id === "PMABU" || _r.id === "PVAB") && _r.entity == "AGENT").map(_r => _r.app);
            let manageGroupApps = req.user.roles.filter(_r => (_r.id === "PMGAP" || _r.id === "PVGAP") && _r.entity === "GROUP").map(_r => _r.app);
            let exceptionAgent = req.user.roles.filter(_r => (_r.id === "PMABC" || _r.id === "PMABU" || _r.id === "PVAB") && _r.entity.startsWith("AGENT_")).map(_r => _r.entity.substr(6));
            let noAgent = req.user.roles.filter(_r => (_r.id === "PNAB") && _r.entity.startsWith("AGENT_")).map(_r => _r.entity.substr(6));
            let appList = permissionApp.concat(manageGroupApps);
            let customFilter = {
                "$and": [
                    {
                        $or: [
                            { app: { "$in": appsAdmin } },
                            {
                                $and: [
                                    {
                                        $or: [
                                            { app: { "$in": appList } },
                                            { _id: { $in: exceptionAgent } }
                                        ]
                                    },
                                    { _id: { $nin: noAgent } }
                                ]
                            }
                        ]
                    }
                ]
            };
            if (req.query.filter) {
                let oldFilter = req.query.filter;
                customFilter["$and"].push((typeof oldFilter === "object" ? oldFilter : JSON.parse(oldFilter)));
            }
            req.query.filter = JSON.stringify(customFilter);
            if (appsAdmin.concat(permissionApp).length == 0 && exceptionAgent.length === 0 && manageGroupApps.length > 0) {
                req.query.select = "_id,name,app,partner,_metadata";
            }
            return false;
        }
    }
    if (authUtil.compareUrl("/api/a/bm/agentRegistry/{id}/password", req.path)) {
        let permissionApp = [];
        let allowedPermission = [];
        if (req.method === "GET") {
            allowedPermission = ["PVAPW"];
        } else if (req.method === "PUT") {
            allowedPermission = ["PMAPW"];
        }
        let id = pathSegment[5];
        let exceptionFlag = req.user.roles.find(_r => (allowedPermission.indexOf(_r.id) > -1) && _r.entity === `AGENT_${id}`);
        if (exceptionFlag) return false;
        permissionApp = req.user.roles.filter(_r => (allowedPermission.indexOf(_r.id) > -1) && _r.entity === "AGENT").map(_r => _r.app);
        return appsAdmin.concat(permissionApp).indexOf(req.apiDetails.app) == -1;
    }
    if (authUtil.compareUrl("/api/a/bm/agentRegistry/{id}/enable", req.path) || authUtil.compareUrl("/api/a/bm/agentRegistry/{id}/disable", req.path)) {
        let permissionApp = [];
        let allowedPermission = [];
        if (req.method === "PUT") {
            allowedPermission = ["PMAEN"];
        }
        let id = pathSegment[5];
        let exceptionFlag = req.user.roles.find(_r => (allowedPermission.indexOf(_r.id) > -1) && _r.entity === `AGENT_${id}`);
        if (exceptionFlag) return false;
        permissionApp = req.user.roles.filter(_r => (allowedPermission.indexOf(_r.id) > -1) && _r.entity === "AGENT").map(_r => _r.app);
        return appsAdmin.concat(permissionApp).indexOf(req.apiDetails.app) == -1;
    }
    if (authUtil.compareUrl("/api/a/bm/agentRegistry/{id}", req.path)) {
        let permissionApp = [];
        let allowedPermission = [];
        if (req.method === "GET") {
            allowedPermission = ["PVAB"];
        } else if (req.method === "PUT") {
            allowedPermission = ["PMABU"];
        }
        else if (req.method === "DELETE") {
            allowedPermission = ["PMABD"];
        }
        let id = pathSegment[5];
        let exceptionFlag = req.user.roles.find(_r => (allowedPermission.indexOf(_r.id) > -1) && _r.entity === `AGENT_${id}`);
        if (exceptionFlag) return false;
        permissionApp = req.user.roles.filter(_r => (allowedPermission.indexOf(_r.id) > -1) && _r.entity === "AGENT").map(_r => _r.app);
        return appsAdmin.concat(permissionApp).indexOf(req.apiDetails.app) == -1;
    }
    if (authUtil.compareUrl("/api/a/bm/{app}/interaction", req.path) || authUtil.compareUrl("/api/a/bm/{app}/interaction/count", req.path) || authUtil.compareUrl("/api/a/bm/{app}/interactionBlock", req.path) || authUtil.compareUrl("/api/a/bm/{app}/interactionBlock/count", req.path)) {
        if (req.method === "GET") {
            let permissionFlow = req.user.roles.filter(_r => (_r.id === "PVI") && _r.entity.startsWith("INTR_")).map(_r => _r.entity.substr(5));
            let intrNoPermission = req.user.roles.filter(_r => (_r.id === "PNI") && _r.entity.startsWith("INTR_")).map(_r => _r.entity.substr(5));
            let agentPermissionApp = req.user.roles.filter(_r => (["PMA", "PVA"].indexOf(_r.id) > -1) && _r.entity === "AGENT").map(_r => _r.app);
            if (permissionFlow.length == 0) {
				if(agentPermissionApp.includes(pathSegment[4]))
					_req.query.select = "status,_metadata";
				else
					return true;
            } else {
                if (req.query.filter) {
                    let oldFilter = req.query.filter;
                    req.query.filter = JSON.stringify({ "$and": [(typeof oldFilter === "object" ? oldFilter : JSON.parse(oldFilter)), { flowId: { "$in": permissionFlow } }, { flowId: { $nin: intrNoPermission } }] });
                } else {
                    req.query.filter = JSON.stringify({ flowId: { "$in": permissionFlow } });
                }
            }

            logger.debug(req.query.filter);
            return false;
        }
    }
    if (authUtil.compareUrl("/api/a/bm/{app}/download/{agentType}/{id}/{type}", req.path) || authUtil.compareUrl("/api/a/bm/{app}/interaction/redownloadFile", req.path)) {
        if (authUtil.compareUrl("/api/a/bm/{app}/download/{agentType}/{id}/{type}", req.path)) {
            let id = pathSegment[7];
            let exceptionFlag = req.user.roles.find(_r => (["PMADL"].indexOf(_r.id) > -1) && _r.entity === `AGENT_${id}`);
            if (exceptionFlag) return false;
        }
        let permissionApp = req.user.roles.filter(_r => _r.id === "PMADL" && _r.entity === "AGENT").map(_r => _r.app);
        return appsAdmin.concat(permissionApp).indexOf(pathSegment[4]) == -1;
    }
    if (authUtil.compareUrl("/api/a/bm/ieg/download/{type}", req.path) || authUtil.compareUrl("/api/a/bm/agentRegistry/IEG/password", req.path)) {
        return true;
    }
    if (authUtil.compareUrl("/api/a/bm/flow/{app}/startAll", req.path) || authUtil.compareUrl("/api/a/bm/flow/{app}/stopAll", req.path)) {
        return appsAdmin.indexOf(pathSegment[5]) === -1;
    }
    if (authUtil.compareUrl("/api/a/bm/{app}/partner/{partnerid}/startAll", req.path) || authUtil.compareUrl("/api/a/bm/{app}/partner/{partnerid}/stopAll", req.path)) {
        let app = pathSegment[4];
		if(appsAdmin.includes(app)) return false;
		return !_req.user.roles.some(_r => _r.id === "PMPM" && _r.entity === "PM" && _r.app === app);
    }
}

function pmAuthorizationMw(req, res, next) {

    if (isPMapiInvalid(req)) {
        return commonAuthZMw.sendForbidden(res);
    }

    let splitUrl = req.path.split("/");
    if (req.path.startsWith("/api/a/bm") && splitUrl[4] !== "partner" && splitUrl[4] != "nanoService") {
        return next();
    }
    if (res.headersSent) return
    commonAuthZMw.getAdditionalData(req, res, next)
        .then(data => {
            let {reqApp, reqEntity, permissions} = data;
            if(permissions) {
                if ((Array.isArray(reqEntity) && reqEntity.indexOf("PM") > -1) || reqEntity === "PM") {
                    let manageGroupApps = req.user.roles.filter(_r => (_r.id === "PMGAP" || _r.id === "PVGAP") && _r.entity === "GROUP").map(_r => _r.app);
                    if ((manageGroupApps.indexOf(reqApp) > -1) && req.method === "GET") {
                        return next();
                    }
                    let flag = commonAuthZMw.checkPermissions(permissions, req.user.roles, reqEntity, "PM", reqApp, req);
                    logger.debug({ flag });
                    if (flag) {
                        return next();
                    } else {
                        return commonAuthZMw.sendForbidden(res);
                    }
                }

                if ((Array.isArray(reqEntity) && reqEntity.indexOf("NS") > -1) || reqEntity === "NS") {
                    let manageGroupApps = req.user.roles.filter(_r => (_r.id === "PMGAP" || _r.id === "PVGAP") && _r.entity === "GROUP").map(_r => _r.app);
                    if ((manageGroupApps.indexOf(reqApp) > -1) && req.method === "GET") {
                        next();
                        return;
                    }
                    let flag = commonAuthZMw.checkPermissions(permissions, req.user.roles, reqEntity, "NS", reqApp, req);
                    logger.debug({ flag });
                    if (flag) {
                        next(); return;
                    } else {
                        sendForbidden(res);
                        return;
                    }
                }
            }
        }).catch(err => {
            logger.error('Error in pmAuthorizationMw :: ', err);
            next(err);
        });
}

module.exports = pmAuthorizationMw;