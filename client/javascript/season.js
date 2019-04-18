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
		steamid : row.dataset.steamid
	};
	console.log(data);

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

function hideSignup(steamid, hide) {
	ld2l.$.ajax('/seasons/hide_signup', {
		steamid : steamid,
		hide : hide,
		season : ld2l.season.id
	}).then(function(data) {
		var row = document.querySelector('tr[data-steamid="'+steamid+'"]');

		if (hide) {
			row.dataset.hidden = "1";
		}
		else {
			row.dataset.hidden = "0";
		}
		ld2l.signupExpand(row);
	});
}

function setDraftable(steamid, draftable) {
	ld2l.$.ajax('/draft/toggle',{
		steamid : steamid,
		draftable : draftable,
		season : ld2l.season.id
	}).then(function(data) {
		var row = document.querySelector('tr[data-steamid="'+steamid+'"]');

		if (draftable) {
			row.dataset.draftable = "1";
		}
		else {
			row.dataset.draftable = "0";
		}
		ld2l.signupExpand(row);
	});
}

function setStandin(steamid, free) {
	ld2l.$.ajax('/standin/toggle', {
		steamid : steamid,
		standin : free,
		season : ld2l.season.id
	}).then(function(data) {
		var row = document.querySelector('tr[data-steamid="'+steamid+'"]');

		if (free) {
			row.dataset.validstandin = "1";
		}
		else
		{
			row.dataset.validstandin = "0";
		}
		ld2l.signupExpand(row);
	});
}

function editSignup(steamid) {
	window.location.href = '/seasons/signup/'+ld2l.season.id+'/'+steamid;
}
