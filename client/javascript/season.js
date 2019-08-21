/**
 * Things used on season-related pages
 */

if (undefined === ld2l) {
	var ld2l = {};
}

ld2l.expandedSignup = null;

ld2l.season = {
	id : 0,
	admin : false,
	current_row : ''
};

ld2l.$.onReady(function() {
	var table = document.getElementById('draft-list');
	ld2l.season.id = parseInt(table.dataset.season);
	ld2l.season.admin = table.dataset.admin == 'true';
});

/**
 * Create the detailed signup info below the current row
 */
ld2l.signupExpand = function(row) {
	if (ld2l.expandedSignup) {
		// element.remove() is experimental
		ld2l.expandedSignup.parentNode.removeChild(ld2l.expandedSignup);
		ld2l.expandedSignup = null;

		// Second click on the same row collapses
		if (row.dataset.steamid == ld2l.season.current_row) {
			ld2l.season.current_row = '';
			return;
		}
	}

	ld2l.season.current_row = row.dataset.steamid;

	var ratings = [
		{ type : 'carry', score : -parseInt(row.dataset.pos1)},
		{ type : 'mid', score : -parseInt(row.dataset.pos2)},
		{ type : 'offlane', score : -parseInt(row.dataset.pos3)},
		{ type : '4 support', score : -parseInt(row.dataset.pos4)},
		{ type : '5 support', score : -parseInt(row.dataset.pos5)}
	];

	ratings = _.sortBy(ratings, 'score');

	var data = {
		admin : ld2l.season.admin,
		season : ld2l.season.id,
		linear : parseInt(row.dataset.linear),
		team : parseInt(row.dataset.team),
		captain : row.dataset.captain == '1' ? 'Y' : (row.dataset.captain == '2' ? 'M' : 'N'),
		createTeam : (parseInt(row.dataset.team) == 0),
		standin : (row.dataset.validstandin == '1'),
		draftable : (row.dataset.draftable == '1'),
		vouched : (row.dataset.vouched == '1'),
		hide : (row.dataset.hidden == '0'),
		solo_mmr : row.dataset.soloMmr,
		party_mmr : row.dataset.partyMmr,
		mmr_screenshot : row.dataset.mmrScreenshot,
		mmr_valid : (row.dataset.mmrValid == '1'),
		positions : ratings,
		steamid : row.dataset.steamid
	};

	dust.render('expanded_signup', data, function(err, out) {
		row.insertAdjacentHTML('afterend', out);
		ld2l.expandedSignup = document.getElementById('expanded_signup');
	});
}

function createTeam(steamid) {
	var row = document.querySelector('tr[data-steamid="'+steamid+'"]');

	ld2l.$.ajax('/seasons/new_team', {
		season : ld2l.season.id,
		steamid : steamid
	}).then(function(data) {
		ld2l.signupExpand(row);
	});
}

function vouch(steamid) {
	ld2l.$.ajax('/profile/'+steamid+'/vouch', {}).then(function(data) {
		if (data.success) {
			var row = document.querySelector('tr[data-steamid="'+steamid+'"]');
			row.dataset.vouched = "1";
			ld2l.signupExpand(row);
		}
	});
}

/**
 * Factory method to generate flag toggling functions for each signup, since we have a lot of flags
 * that are updated in an analogous way
 * @param[in] options.url URL of AJAX endpoint to toggle
 * @param[in] options.dataName Name of dataset field to update based on toggle
 */
function signupFlagToggler(options) {
	return function(steamid, flag) {
		ld2l.$.ajax(options.url, {
			steamid : steamid,
			flag : flag,
			season : ld2l.season.id
		}).then(function(result) {
			var row = document.querySelector('tr[data-steamid="'+steamid+'"]');

			if (flag) {
				row.dataset[options.dataName] = "1";
			}
			else {
				row.dataset[options.dataName] = "0";
			}

			ld2l.signupExpand(row);
		});
	};
}

ld2l.season.hideSignup = signupFlagToggler({
	url : '/seasons/hide_signup',
	dataName : 'hidden',
});

ld2l.season.lockMmr = signupFlagToggler({
	url : '/seasons/lock_mmr',
	dataName : 'mmrValid',
});

ld2l.season.setDraftable = signupFlagToggler({
	url : '/seasons/mark_draftable',
	dataName : 'draftable',
});

ld2l.season.setStandin = signupFlagToggler({
	url : '/seasons/mark_standin',
	dataName : 'validstandin',
});

function editSignup(steamid) {
	window.location.href = '/seasons/signup/'+ld2l.season.id+'/'+steamid;
}
