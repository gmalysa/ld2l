var _ = require('underscore');
var db = require('db-filters');
var fl = require('flux-link');
var BigNumber = require('bignumber.js');

var logger = require('../logger');
var config = require('../config');
var mysql = require('../mysql');

var users = require('../lib/users.js');
var privs = require('../lib/privs.js');

var passport = require('passport');
var steamStrategy = require('passport-steam');
var discordStrategy = require('passport-discord');

// Passport basic config
passport.serializeUser(function(user, done) {
	done(null, user.steamid);
});

passport.deserializeUser(function(steamid, done) {
	var env = new fl.Environment();
	env.steamid = steamid;

	steamChain.call(null, env, function() {
		done(null, env.user);
	});
});

/**
 * We don't have access to the init_db function defined in server.js so it needs to be duplicated
 * here for now.
 */
function init_db(env, after) {
	env.filters = db.clone_filters(db.filters);

	mysql.getValidConnection(env, function() {
		db.set_conn_all(env.conn, env.filters);
		after();
	});
}

function cleanup_db(env, after) {
	if (env.conn)
		env.conn.release();
	after();
}

// Load or create a user entry
var steamChain = new fl.Chain(
	init_db,
	function(env, after) {
		after(env.steamid);
	},
	users.addUser,
	function(env, after, user) {
		env.user = user;
		after();
	},
	cleanup_db
);

// Set up passport for steam login info
passport.use(new steamStrategy({
	returnURL : config.base_url + '/auth/steam/return',
	realm : config.base_url,
	apiKey : config.steam_api_key
}, function(id, profile, done) {
	logger.info('Received steam ID: ' +id, 'Steam');

	var env = new fl.Environment();
	env.steamid = profile.id;
	env.profile = profile;

	steamChain.call(null, env, function() {
		done(null, env.user);
	});
}));

// Add or update discord information in an entry
var discordChain = new fl.Chain(
	init_db,
	function(env, after) {
		env.filters.users.update({
			discord_id : env.user.discord_id,
			discord_name : env.user.discord_name,
			discord_avatar : env.user.discord_avatar,
			discord_discriminator : env.user.discord_discriminator
		}, {
			steamid : env.user.steamid
		}).exec(after, env.$throw);
	},
	cleanup_db
);

// Set up passport to link discord profile to existing steam account
passport.use(new discordStrategy({
	clientID : config.discord_client_id,
	clientSecret : config.discord_client_secret,
	callbackURL : config.base_url + '/auth/discord/return',
	scope : 'identify',
	passReqToCallback : true
}, function(req, accessToken, refreshToken, profile, done) {
	req.user.discord_id = profile.id;
	req.user.discord_name = profile.username;
	req.user.discord_discriminator = profile.discriminator;
	req.user.discord_avatar = profile.avatar;

	var env = new fl.Environment();
	env.user = req.user;
	discordChain.call(null, env, function() { done(null, profile) });
}));

// Add user info to each page's output whether logged in or not
function addUserOutput(env, after) {
	if (env.req.user && env.req.user.steamid) {
		env.user = env.req.user;
		env.$output({user : env.user});
	}
	after();
}

/**
 * This requires that a user be logged in, typically used to gatekeep pages. It will generate
 * an exception if nobody is logged in.
 * @throws Error message about not being logged in
 */
var requireUser = new fl.Chain(
	function(env, after) {
		if (env.req.user && env.req.user.steamid) {
			after(env.req.user.steamid);
		}
		else {
			env.$throw(new Error('You must be logged in to access this page.'));
		}
	},
	users.getUser,
	function(env, after, user) {
		if (null == user) {
			env.$throw(
				new Error('User object not found for logged in user--database may be corrupted')
			);
		}
		else {
			env.user = user;
			after();
		}
	}
);

/**
 * This loads a user's full information and privs if they're logged in, but does not cause an error
 * otherwise
 */
var loadOptionalUser = new fl.Branch(
	function(env, after) {
		if (env.req.user && env.req.user.steamid) {
			after(true);
		}
		else {
			after(false);
		}
	},
	new fl.Chain(
		function(env, after) {
			after(env.req.user.steamid);
		},
		users.getUser,
		function(env, after, user) {
			env.user = user;
			after();
		}
	),
	function(env, after) {
		// A dummy user object--update lib/users to provide a "logged out" user for this
		env.user = {
			privs : []
		};
		after();
	}
);

// Bind to provided express instance at init time
module.exports.init_routes = function(common) {
	common.server.get(
		'/auth/steam',
		passport.authenticate('steam', { failureRedirect : '/' }),
		function(req, res) { res.redirect('/'); }
	);
	common.server.get(
		'/auth/steam/return',
		passport.authenticate('steam', { failureRedirect : '/' }),
		function(req, res) { res.redirect('/'); }
	);
	common.server.get(
		'/auth/logout',
		function(req, res) {
			req.logout();
			res.redirect('/');
		}
	);

	common.server.get(
		'/auth/discord',
		passport.authorize('discord', { failureRedirect : '/' }),
		function(req, res) { res.redirect('/'); }
	);
	common.server.get(
		'/auth/discord/return',
		passport.authorize('discord', { failureRedirect : '/profile' }),
		function(req, res) {
			res.redirect('/profile');
		}
	);

	common.add_pre_hook(fl.mkfn(addUserOutput, 0));
	common.add_pre_hook(requireUser, 'require_user');
	common.add_pre_hook(loadOptionalUser, 'optional_user');
};
