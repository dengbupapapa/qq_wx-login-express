var express = require('express');
var router = express.Router();

var request = require('request');
var querystring = require('querystring');

var API = require('../models/api');
var api = new API.ErpAccountApi();

var config = require('../config/config');
var domain = config.domain; //'http://test.51yyt.com.cn' config.domain//
// console.log(config);

function getToken(querys, req, res) { //qq获取token

    return new Promise(function(resolve, reject) {

        request.get('https://graph.qq.com/oauth2.0/token?' + querys, function(requestErr, requestRes, requestReq) {

            if (requestReq.error) {
                res.apiError(requestReq.error, requestReq.error_description);
                reject(requestReq.error);
                return false;
            }

            var accessToken = querystring.parse(requestReq).access_token;

            resolve({
                accessToken: accessToken,
                reqPromise: req,
                resPromise: res
            });

        });
    })

}

function getOpenId(opts) { //qq获取openid

    return new Promise(function(resolve, reject) {

        request.get('https://graph.qq.com/oauth2.0/me?access_token=' + opts.accessToken, function(meErr, meRes, meReq) {
            // console.log(meReq);

            if (meReq.error) {
                opts.res.apiError(meReq.error, meReq.error_description);
                reject(meReq.error);
                return false;
            }

            var meReqOpts = meReq.match(/callback\(\s+(.+)\s+\)\;/)[1];

            resolve(Object.assign(opts, {
                openid: JSON.parse(meReqOpts).openid
            }));

        });

    });

}

function getUserInfo(opts) { //qq获取userinfo

    return new Promise(function(resolve, reject) {

        request.get('https://graph.qq.com/user/get_user_info?access_token=' + opts.accessToken + '&oauth_consumer_key=101383859&openid=' + opts.openid, function(thirdPartyErr, thirdPartyRes, thirdPartyReq) {

            if (thirdPartyReq.error) {
                opts.res.apiError(thirdPartyReq.error, thirdPartyReq.error_description);
                reject(thirdPartyErr.error);
                return false;
            }

            var jsonThirdPartyReq = JSON.parse(thirdPartyReq);

            resolve(Object.assign(opts, jsonThirdPartyReq));

        });

    });

}

router.get('/', (req, res, next) => { //qq第三方返回data

    var query = req.query;
    console.log(query);
    var options = {
        "grant_type": "authorization_code",
        "client_id": "101383859",
        "client_secret": query.state,
        "code": query.code,
        "redirect_uri": domain + "/thirdPartyLogin"
    };

    getToken(querystring.stringify(options), req, res)
        .then(getOpenId)
        .then(getUserInfo)
        .then(function(data) {

            req.jsonThirdPartyReq = {
                nickname: data.nickname,
                headimgurl: data.figureurl_qq_2,
                openid: data.openid,
                loginResouce: 2,
                bindMobile: query.bindMobile
            }

            next();

        }).catch(function(err) {
            console.log(err);
            res.apiError(err, err);
        });
    // res.renderSuccess('pages/thirdPartyLogin')

});

function wxgetOpenId(options, req, res) { //微信获取openid

    return new Promise(function(resolve, reject) {

        request.get('https://api.weixin.qq.com/sns/oauth2/access_token?' + querystring.stringify(options), function(requestErr, requestRes, requestReq) {

            if (requestReq.error) {
                res.apiError(requestReq.error, requestReq.error_description);
                reject(requestReq.error);
                return false;
            }

            var jsonRequestReq = JSON.parse(requestReq);
            var accessToken = jsonRequestReq.access_token;

            resolve({
                accessToken: accessToken,
                req: req,
                res: res,
                openid: jsonRequestReq.openid
            })

        })

    });

}

function wxgetUserInfo(options) { //微信获取userinfo

    return new Promise(function(resolve, reject) {

        request.get('https://api.weixin.qq.com/sns/userinfo?access_token=' + options.accessToken + '&openid=' + options.openid, function(thirdPartyErr, thirdPartyRes, thirdPartyReq) {

            if (thirdPartyReq.error) {
                options.res.apiError(thirdPartyReq.error, thirdPartyReq.error_description);
                reject(thirdPartyReq.error);
                return false;
            }
            var jsonThirdPartyReq = JSON.parse(thirdPartyReq);
            resolve({
                jsonThirdPartyReq: jsonThirdPartyReq,
                openid: options.openid
            });
        })

    })

}

router.get('/wx', (req, res, next) => { //微信第三方返回data

    var query = req.query;
    var options = {
        "grant_type": "authorization_code",
        "appid": "wxae27d9632847933f",
        "secret": "93bd5ccbbc4beb1a6ea3fe907d030bda",
        // "client_secret": query.state,
        "code": query.code
    };

    if (!query.code) {
        res.redirect('/login');
    }

    wxgetOpenId(options, req, res)
        .then(wxgetUserInfo)
        .then(function(data) {

            req.jsonThirdPartyReq = {
                nickname: data.jsonThirdPartyReq.nickname,
                headimgurl: data.jsonThirdPartyReq.headimgurl,
                openid: data.openid,
                loginResouce: 3,
                bindMobile: query.bindMobile
            }

            next();

        })

});

function setThirdPartyCooike(opts, res) { //设置相关cooike

    res.cookie('nickname', opts.nickname, {
        expires: new Date(Date.now() + 48 * 60 * 60 * 1000)
    });

    res.cookie('imgurl', opts.headimgurl, {
        expires: new Date(Date.now() + 48 * 60 * 60 * 1000)
    });

    res.cookie('userKey', opts.userKey, {
        expires: new Date(Date.now() + 48 * 60 * 60 * 1000),
        httpOnly: true
    });

    res.cookie('userId', opts.userId, {
        expires: new Date(Date.now() + 48 * 60 * 60 * 1000)
    });

}

router.get('(/|/wx)', (req, res, next) => { //获取第三方info和openid后 根据业务逻辑做相关操作

    api.otherLoginUsingPOST({
        "otherLoginReqVO": Object.assign({
            openId: req.jsonThirdPartyReq.openid,
            loginResouce: req.jsonThirdPartyReq.loginResouce,
            regPlat: '1',
            nickname: req.jsonThirdPartyReq.nickname,
            headPicUrl: req.jsonThirdPartyReq.headimgurl
        }, req.baseReqInfo)
    }).then(function(data) {
        // console.log(data);
        if (data.code == 9000) {

            if (data.messageBody.mobile) { //如果该第三方已绑定51手机号

                if (req.jsonThirdPartyReq.bindMobile) { //如果是账户设置里跳转过来并且绑定了一个第三方已绑定的帐号

                    res.renderSuccess('pages/errorDetail', {
                        error: {
                            message: "该第三方帐号已被绑定过"
                        }
                    });

                } else { //直接登录

                    setThirdPartyCooike({
                        nickname: req.jsonThirdPartyReq.nickname,
                        headimgurl: req.jsonThirdPartyReq.headimgurl,
                        userKey: data.messageBody.userKey,
                        userId: data.messageBody.userId
                    }, res)

                    res.redirect(req.cookies.fromUrl || '/page/home');

                }

            } else { //如果该第三方未绑定手机号
                var howeveru = {
                    sk: data.messageBody.userKey,
                    si: data.messageBody.userId
                };
                res.redirect('/thirdPartyLogin/userHandle?' + querystring.stringify(Object.assign({}, req.jsonThirdPartyReq, howeveru)));
                // res.renderSuccess('pages/thirdPartyBindPhone', { //req.jsonThirdPartyReq.bindMobile//如果是从帐号中心来 那么我们是有手机号的
                //     thirdPartyData: Object.assign({}, data.messageBody, req.jsonThirdPartyReq)
                // });

            }

        } else {

            res.apiError(data.code, data.message);

        }

    }).catch(next);

});

router.get('/userHandle', (req, res, next) => { //第三方页面渲染

    var query = req.query;

    res.renderSuccess('pages/thirdPartyBindPhone', { //req.jsonThirdPartyReq.bindMobile//如果是从帐号中心来 那么我们是有手机号的
        thirdPartyData: query
    });

})

router.post('/submit', (req, res, next) => { //第三方页面绑定提交

    var params = req.body;

    api.bindMobileUsingPOST({
        "bindMobileReqVO": Object.assign({}, {
            "loginResouce": params.loginResouce,
            "mobile": params.bindMobile,
            "mobileValidVoucher": params.mobileValidVoucher,
            "moblieVerifyCode": params.bindMobileVerifyCode,
            "openId": params.openid,
            "password": params.bindMobilePassword,
            "userKey": params.howeveruk,
            "userId": params.howeverui
        }, req.baseReqInfo)
    }).then(function(data) {
        console.log(data);
        if (data.code == 9000) {

            setThirdPartyCooike({
                nickname: data.messageBody.nickName,
                headimgurl: data.messageBody.headPicUrl,
                userKey: params.howeveruk,
                userId: params.howeverui
            }, res);

            res.apiSuccess({
                url: params.account ? '/page/account' : '/page/home'
            });
            // res.redirect(req.cookies.fromUrl || '/page/home');

        } else {

            res.apiError(data.code, data.message);

        }

    });

});

module.exports = router;