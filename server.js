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

// Express middleware
var bodyParser = require('body-parser');
var expressSession = require('express-session');
var sessionFileStore = require('session-file-store')(expressSession);
var passport = require('passport');

// local modules
var logger = require('./logger');
var mysql = require('./mysql');
var common = require('./common');

mysql.init();

/**
 * Gets a connection from the mysql pool and clones instances
 * of database filter objects for our use. This is generally
 * the first step in handling any request.
 */
function init_db(env, after) {
	env.filters = db.clone_filters(db.filters);

	mysql.getValidConnection(env, function() {
		db.set_conn_all(env.conn, env.filters);
		after();
	});
}

/**
 * Cleans up the database connection
 */
function cleanup_db(env, after) {
	if (env.conn) {
		env.conn.release();
		delete env.conn;
	}
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

// Configure middleware that runs before route handlers
server.use(config.static_path, express.static(config.static_dir));
server.use(expressSession({
	secret : config.session_secret,
	resave : false,
	saveUninitialized : false,
	maxAge : 30 * 24 * 60 * 60 * 1000,
	store : new sessionFileStore({
		ttl : 30 * 24 * 60 * 60
	})
}));
server.use(bodyParser.urlencoded({extended : false}));
server.use(bodyParser.json());
server.use(passport.initialize());
server.use(passport.session());

var ci = new common.init(server, {
	shutdown		: [{fn : mysql.cleanup}],
	base_url		: config.base_url,
	template_dir	: config.template_dir,
	client_prefix	: config.client_prefix,
	client_path		: config.client_path,
	route_dir		: config.route_dir,
	port			: config.port
});

// Add helpers and hooks
ci.add_pre_hook(fl.mkfn(init_db, 0));
ci.add_finally_hook(fl.mkfn(cleanup_db, 0));
ci.add_dust_filters({md : dust_markdown_filter});

// Finally!
logger.module_init(mod_name, mod_version, 'ld2l online');
