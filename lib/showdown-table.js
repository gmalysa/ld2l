
var showdown = require('showdown');
showdown.extension('showdown-table', function() {
	return {
		type : 'output',
		regex : /<table>/g,
		replace : '<table class="pure-table pure-table-bordered pure-table-striped">'
	};
});

module.exports =  {
	type : 'output',
	regex : /<table>/g,
	replace : '<table class="pure-table pure-table-bordered pure-table-striped">'
};
