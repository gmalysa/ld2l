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
var BigNumber = require('bignumber.js');
var db_migrate = require('db-migrate');

// Express middleware
//var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');
var expressSession = require('express-session');
var passport = require('passport');
var steamStrategy = require('passport-steam');

// local modules
var logger = require('./logger');
var mysql = require('./mysql');
var common = require('./common');

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
	if (env.conn)
		env.conn.release();
	after();
}

var mysql = new mysql({
	database : config.mysql_database,
	user : config.mysql_user,
	password : config.mysql_password
});

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
			user : config.mysql_user,
			password : config.mysql_password,
			host : config.mysql_host,
			database : config.mysql_database,
			multipleStatements : true,
		},
		"sql-file" : true
	}
});

migrations.up().then(function() {
	logger.info('Finished running db migrations', 'db-migrate');
});

// Passport basic config
passport.serializeUser(function(user, done) {
	done(null, user);
});

passport.deserializeUser(function(obj, done) {
	done(null, obj);
});

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
server.use(bodyParser.urlencoded({extended : false}));
server.use(bodyParser.json());
// server.use(cookieParser());
server.use(expressSession({
	secret : config.session_secret,
	resave : false,
	saveUninitialized : false
}));

// Set up passport for login info
server.use(passport.initialize());
server.use(passport.session());
passport.use(new steamStrategy({
	returnURL : config.base_url + '/auth/steam/return',
	realm : config.base_url,
	apiKey : config.steam_api_key
}, function(id, profile, done) {
	var env = new fl.Environment();
	var chain = new fl.Chain(
		init_db,
		function(env, after) {
			env.filters.users.select({steamid : profile.id})
				.exec(after, env.$throw);
		},
		new fl.Branch(
			function(env, after, rows) {
				if (rows.length > 0)
					after(true, rows);
				else
					after(false);
			}, function(env, after, rows) {
				env.user = rows[0];
				after();
			}, function(env, after) {
				var user = {
					steamid : profile.id,
					admin : 0,
					name : profile.displayName,
					avatar : profile._json.avatar
				};
				env.user = user;
				env.filters.users.insert(user).exec(after, env.$throw);
			}
		),
		function(env, after) {
			console.log(env.user);
			console.log(env.user.steamid);
			var steamoffset = new BigNumber('76561197960265728');
			logger.debug('offset: '+steamoffset.toString());
			var steam32 = new BigNumber(env.user.steamid+'').sub(steamoffset);
			logger.debug('steam32: '+steam32.toString());
			env.user.id32 = steam32.toString();
			after();
		});

	logger.info('Received steam ID: ' +id, 'Steam');
	chain.call(null, env, function() { done(null, env.user); });
}));

// Two special routes associated with passport rather than going through normal router rules
server.get(
	'/auth/steam',
	passport.authenticate('steam', { failureRedirect : '/' }),
	function (req, res) { res.redirect('/'); }
);
server.get(
	'/auth/steam/return',
	passport.authenticate('steam', { failureRedirect : '/' }),
	function (req, res) { res.redirect('/'); }
);

// @todo need to add a session store system here, before launching in deployment

var ci = new common.init(server, {
	shutdown		: [{fn : mysql.deinit, ctx : mysql}],
	base_url		: config.base_url,
	template_dir	: config.template_dir,
	client_prefix	: config.client_prefix,
	client_path		: config.client_path,
	route_dir		: config.route_dir,
	port			: config.port
});

// Add helpers and hooks
ci.add_pre_hook(fl.mkfn(init_db, 0));
ci.add_post_hook(fl.mkfn(cleanup_db, 0));

// Finally!
logger.module_init(mod_name, mod_version, 'ld2l online');
