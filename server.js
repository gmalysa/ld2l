/**
 * Main server entry point, this configures express and attaches the relevant pathes,
 * most of which are defined in other files.
 */

// Configuration options
var mod_name = 'ld2l';
var mod_version = '0.1.0';
var config = require('./config.js');

// node.js and other libraries
require('colors');
var express = require('express');
var _ = require('underscore');
var db = require('db-filters');
var fl = require('flux-link');
var db_migrate = require('db-migrate');
var dotaconstants = require('dotaconstants');
var dust = require('dustjs-linkedin');
require('dustjs-helpers');

const child_process = require('child_process');

// Express middleware
var bodyParser = require('body-parser');
var expressSession = require('express-session');
var sessionFileStore = require('session-file-store')(expressSession);
var passport = require('passport');
var siosession = require('express-socket.io-session');
var siopassport = require('passport.socketio');

// local modules
var logger = require('./logger');
var mysql = require('./mysql');
var common = require('./common');

var version = {};

/**
 * Get version from git as the current commit hash
 */
child_process.exec("git log -n 1 --pretty=oneline", function(err, out, stderr) {
	version.v = out.split(' ')[0];
});

mysql.init();

/**
 * Create the cache objects that are used within one request to reduce how much we hit the db
 * while requesting multiple of the same thing (i.e. teams, users, etc.)
 */
function init_cache(env, after) {
	env._teamCache = {};
	after();
}

// Load databse filter definitions
db.init(process.cwd() + '/filters', function(file) {
	logger.info('Adding database definition ' + file.blue.bold + '...', 'db-filters');
}, db.l_info);

db.set_log(function(msg) {
	logger.info(msg, 'db-filters');
});

// Check for and run database migrations
migrations = db_migrate.getInstance(true, {
	config : {
		dev : {
			driver : 'mysql',
			user : config.mysql.user,
			password : config.mysql.password,
			host : config.mysql.host,
			database : config.mysql.database,
			multipleStatements : true,
		},
		"sql-file" : true
	}
});

migrations.up().then(function() {
	logger.info('Finished running db migrations', 'db-migrate');
});

// Initialize showdown, the markdown converter for various content on the site
// These settings should match those specified in the makefile
var showdown = require('showdown');
var showdown_converter = new showdown.Converter({
	parseImgDimensions : true,
	simplifiedAutoLink : true,
	excludeTrailingPunctuationFromURLs : true,
	strikethrough : true,
	tables : true,
	tasklists : true,
	emoji : true
});
function dust_markdown_filter(value) {
	return showdown_converter.makeHtml(value);
}

// Initialize express
var server = express();
_.each(config.set, function(v, k) {
	server.set(v, k);
});
_.each(config.enable, function(v, k) {
	server.enable(v, k);
});

// Add current time as early as possible in requests
server.use(function(req, res, next) {
	res.start = process.hrtime();
	next();
});

var sessionStorage = new sessionFileStore({
	ttl : 25 * 24 * 60 * 60
});

var sessionMiddleware = expressSession({
	secret : config.session_secret,
	resave : false,
	saveUninitialized : true,
	cookie : {
		maxAge : 25 * 24 * 60 * 60 * 1000,
	},
	store : sessionStorage,
	rolling : true
});

// Configure middleware that runs before route handlers
server.use(config.static_path, express.static(config.static_dir));
server.use(sessionMiddleware);
server.use(bodyParser.urlencoded({extended : false}));
server.use(bodyParser.json({limit : '1mb'}));
server.use(passport.initialize());
server.use(passport.session());

var ci = new common.init(server, {
	shutdown		: [{fn : mysql.cleanup}],
	base_url		: config.base_url,
	template_dir	: config.template_dir,
	client_prefix	: config.client_prefix,
	both_prefix		: config.both_prefix,
	client_path		: config.client_path,
	route_dir		: config.route_dir,
	port			: config.port
});

// Connect socket.io middleware to interface with express middleware
ci.io.use(siosession(sessionMiddleware));
ci.io.use(siopassport.authorize({
	key : 'connect.sid',
	secret : config.session_secret,
	store : sessionStorage
}));

// Send server version to client on startup
ci.io.on('connect', function(socket) {
	if (undefined !== version.v) {
		socket.emit('version', version.v);
	}
});

// Add helpers and hooks
ci.add_pre_hook(fl.mkfn(mysql.init_db, 0));
ci.add_pre_hook(fl.mkfn(init_cache, 0));
ci.add_finally_hook(fl.mkfn(mysql.cleanup_db, 0));
ci.add_dust_filters({md : dust_markdown_filter});
ci.add_dust_helpers({
	dota_hero_icon : function(chunk, context, bodies, params) {
		var hero = dust.helpers.tap(params.hero, chunk, context);
		if (undefined !== dotaconstants.heroes[hero]) {
			var img = "http://cdn.dota2.com/" + dotaconstants.heroes[hero].img;
			var alt = dotaconstants.heroes[hero].localized_name;
			chunk.write('<img title="'+alt+'" class="ld2l-dota-hero" src="'+img+'" />');
		}
		return chunk;
	},
	dota_item_icon : function(chunk, context, bodies, params) {
		var item = dust.helpers.tap(params.item, chunk, context);
		if (undefined !== dotaconstants.items[dotaconstants.item_ids[item]]) {
			var img = "http://cdn.dota2.com/" + dotaconstants.items[dotaconstants.item_ids[item]].img;
			var alt = dotaconstants.items[dotaconstants.item_ids[item]].dname;
			chunk.write('<img title="'+alt+'" class="ld2l-dota-item" src="'+img+'" />');
		}
		return chunk;
	}
});

// Finally!
logger.module_init(mod_name, mod_version, 'ld2l online');
