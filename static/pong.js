$(document).ready(function() {

// force scrolling to the top of the page on reload s.t. loading screen 
// displays correctly
$(window).on('beforeunload', function() {
	$(window).scrollTop(0);
});

$('#loading').fadeIn();

// Define global variables
var windowWidth = window.innerWidth,
	windowHeight = window.innerHeight,
	svgWidth = windowWidth * 0.9,
	svgHeight = 160;

var all_svg, 
	minor_svg, 
	json,
	popNames, 
	popSizes,
	plotWidth,
	minorWidth,
	indivWidth,
	translate,
	xStart,
	xMax,
	bgColor = "black",
	plotHeight = svgHeight * 0.8,
	labelFontSize = 20, // or can we get this directly from the CSS?
	labelRotate = 45,
	labelDistFromPlot = 10,
	labelLeftPad = 5,
	clusterClick = false,
	popClick = false,
	grayClick = false;

var stack = d3.stack();

var area = d3.area()
	.x(function(d, i) { return xScale(d.data.index); })
	.y0(function(d) { return yScale(d[0]); })
	.y1(function(d) { return yScale(d[1]); })
	.curve(d3.curveStepAfter);
	
// Default color scheme (overwritten if custom colors provided).

//var colors = colorbrewer.Set1[9];

//var colors = ["#66c2a5","#fc8d62","#8da0cb","#e78ac3",
//	"#a6d854","#ffd92f","#e5c494","#b3b3b3"];

var colors = ["#E04B4B", "#6094C3", "#63BC6A", "#A76BB2", "#F0934E",
	"#FEFB54", "#B37855", "#EF91CA", "#A4A4A4"];

var colors_26 = ["#f0a3ff", "#0075dc", "#993f00", "#4c005c", "#191919", 
	"#005c31", "#2bce48", "#ffcc99", "#808080", "#94ffb5", "#8f7c00", 
	"#9dcc00", "#c20088", "#003380", "#ffa405", "#ffa8bb", "#426600", 
	"#ff0010", "#5ef1f2", "#00998f", "#e0ff66", "#740aff", "#990000", 
	"#ffff80", "#ffff00", "#ff5005"];

var queue = 0; // number of plots queued
var json;

var xScale = d3.scale.linear(),
	yScale = d3.scale.linear();

var zoom = d3.behavior.zoom().on("zoom", draw);
var xAxis;

var popClicked = new Array();


/* ========================== WINDOW RESIZE ALERT ========================== */
var browserWindowWidth = $(window).width();

// window resize handler
$(window).resize(function() {
	// only care if the width changes, not height
	if ($(this).width() != browserWindowWidth) {
	  browserWindowWidth = $(this).width();
	  if(this.resizeTO) clearTimeout(this.resizeTO);
	  // only fire event if user has finished resizing the window
	  this.resizeTO = setTimeout(function() {
		  $('#resize-warning-nav').show();
	  }, 500);
	}
});

// click X button to clear the notification
$('#resize-warning-exit').click(function(){
  $('#resize-warning-nav').hide();
});
/* ========================================================================= */

// SOCKET THINGS
var url = "ws://" + location.host + "/pongsocket";
var socket = new WebSocket(url);
var progressCount = 0;
var numPlots = 0;
socket.onmessage = function(e) {
	var data = JSON.parse(e.data);
	if (data.type == 'pong-data') {
		json = data.pong;
		for (var i in json.qmatrices) {
			modes = Object.keys(json.qmatrices[i].modes).length;
			if (modes == 1) { numPlots += 1; }
			else { numPlots += modes + 1; }
		}
		$('#loading').fadeIn();
		queue += json.qmatrices.length;

		if (json.hasOwnProperty("popNames") && json.hasOwnProperty("popSizes")) {
			popNames = json.popNames;
			popSizes = json.popSizes;
		} else {
			popNames = {};
			popSizes = {};
		}
		
		if (json.colors.length > 0) colors = json.colors;
		else if (json.K_max > 9) colors = colors_26;
		all_svg = new Array();

		for (i = 0; i < json.qmatrices.length; i++) {
			// appending major mode rep runs
			var majorID = json.qmatrices[i].major_mode_runid;
			plot = d3.select('#visualization')
				.append('svg')
				.attr("width", svgWidth)
				.attr("height", svgHeight+15)
				.attr('class', 'majorSVG ' + json.qmatrices[i].K)
				.attr("id", "plot"+majorID);
			all_svg.push(plot);
			getQmatrix(majorID, 'no', null, null);
		}
	} else if (data.type == 'q-matrix') {
		progressCount += 1;
		d3.select("#progress-bar").transition().attr("width", 280*progressCount/numPlots);
		var is_minor;
		if (data.minor == "yes") is_minor = true;
		else is_minor = false;
		var minorID = data.minorID;
		var is_first = data.is_first;

		if (!is_minor) {
			generateVis(d3.select('#plot'+data.name), data.K,
				data.matrix2d, is_minor, minorID, is_first, data.name);
		} else {
			generateVis(d3.select('#plot'+data.name+'_minor'), data.K, 
				data.matrix2d, is_minor, minorID, is_first, data.name);
		}
	}
}

// sends server info about the matrix to get the qmatrix
var getQmatrix = function(matrixID, is_minor, minorID, is_first) {
	socket.send(JSON.stringify({ 'type':'get-qmatrix', 'name': matrixID, 
		'minor': is_minor, 'minorID': minorID, 'is_first': is_first }));
}

var generateVis = function(svg, K, qData, is_minor, minorID, is_first, name) {
	var indivHeight = plotHeight;
	var colorPerm = json.qmatrices[K-json.K_min].color_perm;
	plotWidth = svgWidth * 0.84;
	translate = svgWidth * 0.08;
	xStart = 0;

	var currentPlot = json.qmatrices[K-json.K_min];
	var majorID = currentPlot.major_mode_runid;

	// keyList is a list of minor mode ids for a K value
	var keyList = Object.keys(currentPlot.modes);
	var major = keyList.indexOf(majorID);
	if (major > -1) keyList.splice(major, 1);

	// minor IDs of current K val
	var sortedMinorKeys = sortKeyList(currentPlot, keyList);
	// keyList should be in order
	if (keyList.length!=0 && !is_minor) { 
		queue += keyList.length+1; 
		// +1 because we're going to re-add the major at the top of the modal	
		buttons(K, sortedMinorKeys);
	} 

	if (!is_minor) {
		printLabels(svg, K, currentPlot);
		similarity(svg, K, majorID);
	}
	else printMinorLabels(svg, currentPlot, minorID, is_first);

	var translateY = 15;
	var border = 5;
	svg.append("rect") // black background rectangle
		.attr("class", "background")
		.attr("x", translate - border/2)
		.attr("y", translateY - border/2)
		.attr("height", indivHeight + border)
		.attr("width", plotWidth + border)
		.attr("fill", bgColor);

	var chart = svg.append('g')
		.attr('transform', 'translate(' + translate + ', ' + translateY + ')')
		.attr("class", "chart")
		.attr("clip-path", "url(#clip)");

	chart.append("clipPath")
		.attr("id", "clip")
		.append("rect")
		.attr("width", plotWidth)
		.attr("height", indivHeight + 50);	

	// xMax is index of last member of last population (+1 b/c curveStep)
	xMax = 1 + qData.slice(-1)[0].members.slice(-1)[0].index;
	xScale.range([0, plotWidth]).domain([0, xMax]);
	yScale.range([indivHeight, 0]).domain([0, 1]);

	// draw lines at index of 1st member of every population
	tickVals = [];
	qData.forEach(function(p) { tickVals.push(p.members[0].index); });

	var keys = Object.keys(qData[0].members[0])
		.filter(function(e) { return e != "index"; })
		.sort(sortCluster);
	stack.keys(keys);

	var pops = chart.selectAll(".pops")
		.data(qData)
		.enter() // one g per population
		.append("g")
		.attr("class", function(d) {
			return "pops " + "population" + d.population_index;
		});

	var layer = pops.selectAll(".layer")
		.data(function(d) { 
			var stackObject = stack(d.members);
			for (var i = 0; i < stackObject.length; i++) {
				stackObject[i].population_index = d.population_index;
				stackObject[i].K = K;
				stackObject[i].indiv_avg = 
					json.indiv_avg[name][d.population_index];
			}
			return stackObject; 
		})
		.enter() // one layer for every cluster
		.append("g")
		.attr("class", "layer");

	layer.append("path")
		.attr("class", function(d, i) {
			var className = "area ";
			if (is_minor) className += minorID+"_minorCluster"+colorPerm[i] + " ";
			className += "K" + d.K + " population" + d.population_index + 
				" cluster" + colorPerm[i];
			return className;
		})
		.style("fill", function(d, i) { return colors[colorPerm[i]]; })
		.attr("d", function(d,i) {
			var fakePerson = [0,0]; // need this to see last bar in population
			fakePerson.data = {index: d[d.length-1].data.index + 1};
			d[d.length] = fakePerson;
			return(area(d));
		})
		.on("click", function(thisDat) {
			if (!grayClick) { // if the multimodality checkbox is unchecked 
				d3.selectAll("path.area").style("fill", function(thatDat) {
					var localColors = json.qmatrices[thatDat.K-json.K_min].color_perm;
					if (!clusterClick) {
						if (localColors[parseInt(thatDat.key.slice(7)) - 1] != colorPerm[parseInt(thisDat.key.slice(7)) - 1]) {
							return "white";
						} else {
							return colors[localColors[parseInt(thatDat.key.slice(7)) - 1]];
						}
					} else {
						return colors[localColors[parseInt(thatDat.key.slice(7)) - 1]];
					}
				});
				if (!clusterClick) d3.selectAll(".check-input").attr("disabled", "disabled");
				else d3.selectAll(".check-input").attr("disabled", null);
				clusterClick = !clusterClick;
			}
		});

	var paths = d3.selectAll("path.area");
	paths.call(zoom).on("dblclick.zoom", null);

	if (Object.keys(popNames).length > 0) {
		paths.call(tip)
			.on('mouseover', tip.show)
			.on('mouseout', tip.hide);
	}

	var majorrepruns = d3.selectAll('#major_repstring')
	majorrepruns.call(reprun_tip)
		.on('mouseover', reprun_tip.show)
	 	.on('mouseout', reprun_tip.hide)

	if(is_minor) {
		var minorrepruns = d3.selectAll('#minor_repstring')
		minorrepruns.call(reprun_tip)
		 	.on('mouseover', reprun_tip.show)
		 	.on('mouseout', reprun_tip.hide);
	}

	xAxis = d3.svg.axis()
		.scale(xScale)
		.orient("bottom")
		.tickValues(tickVals)
		.tickFormat("")
		.tickSize(-indivHeight);

	chart.append("g")
	    .attr("class", "x axis")
	    .attr("transform", "translate(0," + indivHeight + ")")
	    .style("fill", "none")
	    .style("stroke", bgColor)
	    .call(xAxis);

	// min zoom: 1x; max zoom: 20x
	zoom.x(xScale).scaleExtent([1, 20]);

	// graying out minor clusters that are different from the major modes 
	d3.select('#whiteout'+K).on('click', function() {
		for (i in sortedMinorKeys) {
			grayOutSim(K, sortedMinorKeys[i], colorPerm, indivWidth);
		}
		grayClick = !grayClick;
	});

	if (K == json.K_max && !is_minor) {
		var svglabelGroup = d3.select('#visualization')
			.append("svg")
			.attr('class', 'majorPopLabels')
			.attr("width", svgWidth+80)
		var labelGroup = svglabelGroup.append('g')
			.attr("class", "labelSVG")
			.attr("transform", "translate("+(translate - border/2)+",0)");
			
		if (Object.keys(popNames).length > 0) {
			addPopLabels(labelGroup, false, K, tickVals);
		}

		svglabelGroup.attr('height', labelGroup.node().getBBox().height+80);

	} else if (minorID && minorID == sortedMinorKeys.slice(-1)[0]) {
		var svglabelGroup = d3.select('#modal_body_'+K)
			.append('svg')
			.attr('class', 'minorPopLabels_'+K)
			.attr('height', svgHeight)
			.attr('width', svgWidth);

		var labelGroup = svglabelGroup.append('g')
			.attr('class', "labelSVGminor_" + K)
			.attr("transform", "translate("+(translate - border/2)+",0)");

		if (Object.keys(popNames).length > 0) {
			addPopLabels(labelGroup, true, K, tickVals);
		}

		addModalFooter(K);
	}

	//creating print buttons for major modes; 
	//for minor mode we probably need minorID
	createbuttons(svg, K, currentPlot, is_minor, json.K_min, "print"); 
	// createbuttons(svg, K, currentPlot, is_minor, json.K_min, "download"); 
	if(!is_minor) {
		var myID = currentPlot.major_mode_runid;
	}
	if(is_minor) {
		var myID = svg[0][0].getAttribute('id').slice(4);
	}
	$('#'+myID+'_print').click(function(e) {
	  e.preventDefault();
	  saveSVG(currentPlot, is_minor, svg, myID, "print"); //print this svg
	});

	$('#'+myID+'_download_png').click(function(e) {
	  e.preventDefault();
	  saveSVG(currentPlot, is_minor, svg, myID, "png"); //download svg as png 
	});

	$('#'+myID+'_download_svg').click(function(e) {
	  e.preventDefault();
	  saveSVG(currentPlot, is_minor, svg, myID, "svg"); //download svg as svg 
	});

	//enabling all bootstrap tooltips (modal sim_threshold messaging)
	$(document).ready(function(){
  	  	$('[data-toggle="tooltip"]').tooltip();
	});

	queue--;
	if (queue === 0) {
		$('#loading').delay(200).fadeOut();
	}

} //end generateVis

/********************  ALL HELPER FUNCTIONS GO HERE  ********************/

// redraw upon zooming
function draw() {
	// don't allow panning beyond chart edges
	if (xScale.domain()[0] < 0) {
		var x = zoom.translate()[0] - xScale(0) + xScale.range()[0];
		zoom.translate([x, 0]);
	} else if (xScale.domain()[1] > xMax) {
		var x = zoom.translate()[0] - xScale(xMax) + xScale.range()[1];
		zoom.translate([x, 0]);
	}
	d3.selectAll("g.x.axis").call(xAxis);
	var t = d3.event.translate[0],
		s = d3.event.scale;
	t = Math.min(0, Math.max(plotWidth * (1 - s), t));

	d3.selectAll("path.area")
		.attr("transform", "translate("+t+",0)scale("+s+", 1)");
	//d3.selectAll("path.area").attr("d", area);

	// label update
	d3.selectAll(".popLabels").attr("transform", function(d) {
			var transX = xScale(d) + labelLeftPad,
				transY = labelDistFromPlot,
				rotate = labelRotate;
			return "translate("+transX+","+transY+")rotate("+rotate+")"; 
		})
		.style("fill", function(d) {
			if (xScale(d)+labelLeftPad<0 || xScale(d)+labelLeftPad>plotWidth) {
				return "none";
			} else return "black";
		});
}

var addPopLabels = function(labelGroup, is_minor, K, data) {
	var labels = labelGroup.selectAll(".popLabels")
		.data(data)
		.enter()
		.append("text")
		.style("font-family", "Helvetica")
		.text(function(d,i) { return popNames[i]; })
		.attr("transform", function(d) {
			var transX = xScale(d) + labelLeftPad,
				transY = labelDistFromPlot,
				rotate = labelRotate;
			return "translate("+transX+","+transY+")rotate("+rotate+")"; 
		})
		.attr("class", "popLabels noSelect")
		.attr("id", function(d,i) { return "major_pop" + i; })
		.on("click", function(d, i) {
			if (d3.event.shiftKey && popClick) {
				var pops = d3.selectAll("path.area.population" + i);
				if (pops.attr("fill-opacity") == 1) pops.attr("fill-opacity", 0.2);
				else pops.attr("fill-opacity", 1);
			} else {
				d3.selectAll("path.area").attr("fill-opacity", function(thatDat) {
					var localColors = json.qmatrices[thatDat.K-json.K_min].color_perm;
					if (!popClick) {
						if (thatDat.population_index != i) {
							return 0.2;
						} else {
							return 1;
						}
					} else {
						return 1;
					}
				});
				popClick = !popClick;
			}
		});
}

// updating svg dim
var getLabelDim = function(handle, label){
	labelsvg = d3.select('.'+label).select('g').node();
 	return [labelsvg.getBBox().height+15, 
 		labelsvg.getBBox().width+labelsvg.getBBox().x+15];
}

var buttons = function(K, sortedMinorKeys) {
	var buttonDiv = d3.select('body').append('div').attr('class', 'buttonDiv');
	var button = buttonDiv
		.append("button")
		.attr("class", "modes btn btn-info btn-lg")
		.attr('data-toggle', 'modal')
		.attr('data-target', '#modal-'+K)
		.attr("id", 'button-'+K);

	button.style('position', 'absolute')
		.style('top', 129+(svgHeight+20) * (K-json.K_min)+98 + 'px') 
		.style('left', (translate + svgWidth*0.84 + 20) + 'px');

	button.html('<i class="fa fa-plus"></i> <span style="font-weight:bold;' + 
		' font-size:125%;">'+ sortedMinorKeys.length+'</span>');

	modal(K, sortedMinorKeys, button, buttonDiv);
}

var modal = function(K, sortedMinorKeys, button, buttonDiv) {
	var modal_fade = buttonDiv.append('div')
		.attr('class', 'modal fade')
		.attr('id', 'modal-'+K)
		.attr('role', 'dialog');

	var modal_dialog = modal_fade.append('div')
		.attr('class', 'modal-dialog');

	var modal_content = modal_dialog.append('div')
		.attr('class', 'modal-content')
		.attr('id', 'modal-content-'+K)
		.style('width', (svgWidth + 45)+'px') 
		//wide so as not to cover the major mode label
		.style('left', (xStart+10) +'px');

	var modal_header = modal_content.append('div')
		.attr('class', 'modal-header')
		.attr('id', 'title'+K);

	var close = modal_header.append('button')
		.attr('type', 'button')
		.attr('class', 'close')
		.attr('data-dismiss', 'modal')
		.html("<span>&times;</span>");

	var title = modal_header.append('h2')
		.attr('class', 'modal-title')
		.html('Clustering modes, K=' + K);

	minor_svg = new Array();

	var colorPerm = json.qmatrices[K-json.K_min].color_perm;

	$('#modal-' + K).on('hide.bs.modal', function (e) {
		if (grayClick) {
			for (i in sortedMinorKeys) {
				grayOutSim(K, sortedMinorKeys[i], colorPerm, indivWidth);
			}
			grayClick = false;
			$('#whiteout' + K).attr('checked', false);
		}
	})

	var modal_header2 = modal_content.append('div')
		.attr('class', 'modal-header')
		.attr('id', 'modal_header2_'+K);

	dirtyGray = 0; // dirty bit to figure out if gray indices exist
	for (i = 0; i < sortedMinorKeys.length; i++) {
		var minorID = sortedMinorKeys[i];
		minor_obj = json.qmatrices[K-json.K_min].modes[minorID];
		if(minor_obj.gray_indices.length != 0) {
			dirtyGray = 1;
			break;
		} 
	}
	if (dirtyGray) { // enable multimodality highlighting
		var checkbox = modal_header2.append('label')
			.attr('class', 'checkbox-inline');
		checkbox.append('input').attr('type', 'checkbox')
			.attr('class', 'check-input')
			.attr('id', 'whiteout'+K);	
		checkbox.style('position', 'relative').style('top', '4px');

		var checkbox_caption = modal_header2.append('label')
			.attr('class', 'checkbox-caption noSelect')
			.attr("for", "whiteout"+K)
			.text('\nCheck to highlight multimodality: ');
	} else { // if no minor mode cluster can be grayed out, give error message
		// making the error message case appropriate
		if (sortedMinorKeys.length == 1) mymodestr = "minor mode";
		else mymodestr = "minor modes";
		// messaging is achieved with bootstrap danger button and tooltip
		modal_header2.append('button').attr('type', 'submit')
			.attr('class', 'btn btn-danger btn-small pull-right')
			.attr('id', 'highlightMM_'+K)
			.attr('data-toggle', 'tooltip')
			.attr('data-placement', 'left')
			.attr('title', 'Similarity between corresponding' +
				' clusters in the major mode and ' + mymodestr +
				' is less than the similarity threshold of ' + 
				json.sim_threshold + '. Lower the similarity' +
				' threshold in pong\'s command line to enable highlighting.')
			.text('Why can\'t I highlight multimodality?')
	}

	// pushing weird major plot:
	var majorID = json.qmatrices[K-json.K_min].major_mode_runid;
	plot = d3.select('#modal_header2_'+K).append('svg')
		.attr("width", svgWidth)//*0.75)
		.attr("height", svgHeight+15)//*0.95)
		//class allows the printing of all plots later on
		.attr("class", "minorSVG-"+K + " first") 
		.attr("id", "plot"+majorID+'_minor');
	minor_svg.push(plot);
	//this major mode acts like minor because it is in the dialog box:
	getQmatrix(majorID, 'yes', majorID, 'yes'); 		

	//both viz true and false:
	var modal_body = modal_content.append('div')
		.attr('class', 'modal-body')
		.attr('id', 'modal_body_'+K);

	//gets qmatrix for each minor plot
	for (i = 0; i < sortedMinorKeys.length; i++) {
		var minorID = sortedMinorKeys[i];
		plot = d3.select('#modal_body_'+K).append('svg')
			.attr("width", svgWidth)
			.attr("height", svgHeight+15)
			//added in order to print all plots later on
			.attr("class", "minorSVG-"+K) 
			.attr("id", "plot"+minorID+'_minor');
		minor_svg.push(plot);
		getQmatrix(minorID, 'yes', minorID, 'no');
	}
} // end modal

var printLabels = function(svg, K, currentPlot) { 
	var totRuns = currentPlot.total_runs;
	var majorID = currentPlot.major_mode_runid;
	var numMajorRuns = currentPlot.modes[majorID].runs_represented.length;
	var yPos = 0.5*plotHeight+ 0.5*labelFontSize;

	//K labels to the left of the plot
	label = svg.append("text").text("K = "+K); //K label on left
	label.attr("class","label")
		.style('font', 'bold 20px Helvetica, sans-serif');
	label.attr("x",0).attr("y", yPos);
	//major runs out of total runs under K label
	runs = svg.append('text')
		.text(numMajorRuns+'/'+totRuns+' runs')
		.attr('id', 'major_repstring');
	runs.attr("x",0).attr("y", yPos+25);
	runs.style('font', '12px Helvetica, sans-serif');

	var reppedruns = new Array (currentPlot.modes[majorID].runs_represented.sort().join('-'), "runs")
	runs.data(reppedruns)
	runs.style('fill', '#5bc0de').style('text-decoration', 'underline');

	var bbox = document.getElementById('major_repstring').getBBox();
	var width = bbox.width;
	if(width > translate) translate = width + 5;

	//puts avg_sim in labels section
	avg_sim = currentPlot.modes[majorID].avg_sim;
	if(avg_sim!=null) {
		sim = svg.append('text')
			.text('Avg. pairwise similarity: '+
				avg_sim.toString().substring(0,5));
		sim.attr('x', translate)
			.attr('y', 9); // fits it right in the space beteen svg top and chart
		sim.style('fill', 'rgb(70, 184, 218)'); //blue plus button color
		sim.style('font', 'bold 11px Helvetica, sans-serif');
	}
}

var printMinorLabels = function(svg, currentPlot, minorID, is_first) {
	var totRuns = currentPlot.total_runs;
	var numMinorRuns = currentPlot.modes[minorID].runs_represented.length;
	var yPos = 0.5*plotHeight*0.85 + 0.5*labelFontSize;
	//labels to the left
	if (is_first == 'yes') {
		major = svg.append('text').text('major mode');
		major.attr('class', 'majorMinorLabel')
			.attr('id', 'minor_bigstring');
		// x location to 0 to left align mode text
		major.attr('x',0).attr('y', yPos-38-15); 
		major.style('font', 'bold 14px Helvetica, sans-serif')
	}

	if (83.609 > translate) translate = 83.609 + 5; 
	//78.609 is width of label "major mode" - used this fixed value here

	label = svg.append('text').text(minorID);
	label.attr("class","label");
	label.attr("x",0).attr("y", yPos-26);
	label.style('font', '20px Helvetica, sans-serif')
	//represents
	rep = svg.append('text').text('represents'); 
	rep.attr("x",0).attr("y", yPos+14-26);
	rep.style('font', '12px Helvetica, sans-serif');
	//num x/x runs
	runs = svg.append('text').text(numMinorRuns+'/'+totRuns+' runs');
	runs.attr('id', 'minor_repstring');
	runs.attr('x',0).attr('y', yPos+30-26);
	runs.style('font', '12px Helvetica, sans-serif');

	var reppedruns = new Array (currentPlot.modes[minorID].runs_represented.sort().join('-'), "runs")
	runs.data(reppedruns)
	runs.style('fill', '#5bc0de').style('text-decoration', 'underline');

	//puts avg_sim in labels section
	avg_sim = currentPlot.modes[minorID].avg_sim;
	if(avg_sim!=null) {
		sim = svg.append('text')
			.text('Avg pairwise similarity:' + 
				avg_sim.toString().substring(0,5));
		sim.attr('class', 'avg_sim');
		sim.attr('x', translate).attr('y', 10);
		sim.style('fill', 'rgb(70, 184, 218)'); //blue plus button color
		sim.style('font', 'bold 12px Helvetica, sans-serif');
	} 
	return(0); //return increase in translate
} //end printMinorLabels

var sortKeyList = function(currentPlot, keyList) {
	var minorDict = {};
	for (var i in keyList) {
		var current_minor = keyList[i];
		var current_minor_runs = currentPlot.modes[current_minor]
			.runs_represented.length;
		minorDict[current_minor] = current_minor_runs;
	}
	var items = Object.keys(minorDict).map(function(key) { 
		// put in array format
		return [key, minorDict[key]];
	});	
	// Sort the array based on the second element
	items.sort(function(first, second) { return second[1] - first[1]; });
	var sortedMinorKeys = new Array();
	for (var i in items) {sortedMinorKeys.push(items[i][0])}
	return sortedMinorKeys;
}

// grays out clusters for one minor plot
var grayOutSim = function(K, minorID, colorPerm, indivWidth) {
	// graying out minor clusters that are different from the major modes
	var minor_obj = json.qmatrices[K-json.K_min].modes[minorID];
	if (minor_obj.gray_indices != null) {
		var gray_indices = minor_obj.gray_indices;

		for (i in minor_obj.gray_indices) {
			var grayOutIndex = colorPerm[gray_indices[i]];
			var cluster_to_gray = '.'+minorID+'_minorCluster'+grayOutIndex;
			// grays out one color at a time if visible
			// pops back up if hidden (oncheck)
			var footerButtonPrint = d3.select('#modal_body_' + K)
				.select('.printModal');
			var footerButtonDownload = d3.select('#modal_body_' + K)
				.select('.modalDropdown a div');

			if (d3.selectAll(cluster_to_gray).style('fill')
				!='rgb(255, 255, 255)') {
				d3.selectAll(cluster_to_gray)
					.style('fill', 'white');
				footerButtonPrint.classed('btn btn-primary', true)
					.text("Print highlighting multimodality at K="+K);
				footerButtonDownload.classed('btn btn-primary', true)
					.text("Download highlighting multimodality at K="+K);
			} else {
				d3.selectAll(cluster_to_gray)
					.style('fill', colors[colorPerm[gray_indices[i]]]);
				footerButtonPrint.classed('btn-primary', false)
					.text("Print all modes at K="+K);
				footerButtonDownload.classed('btn-primary', false)
					.text("Download all modes at K="+K);
			}
		} //end for
	} //end if
}

var similarity = function(svg, K) {
	//adds average similarity between modes in dialog header
	var score = json.qmatrices[K-json.K_min].avg_sim_bt_modes
	var avg_sim_bt_modes = Math.round(score*1000)/1000;
	if(avg_sim_bt_modes!=null)
		simMode = d3.select('#title'+K).append('h4')
					.text('\nAvg pairwise similarity among modes = '+
						avg_sim_bt_modes);
}

// repruns tooltip
var reprun_tip = d3.tip()
	.direction('s') // put southward tooltip underneath svg
	.attr('class', 'd3-tip')
	.offset([10,0])
	.attr('font-size', '14px')
	.html(function(d) {
		var runids = d.split('-')
		var body = '<div class="text-center text-tip"><strong>runs<br>represented</strong>'; 
		for (var i = 0, len = runids.length; i < len; i++) {
 			body += '<br>' + runids[i];
		}
		//body += '<div><ul>';
		return(body)
	});

// tooltip
var tip = d3.tip()
	.direction('s') // put southward tooltip underneath svg
	.attr('class', 'd3-tip')
	.offset([10,0])
	.html(function(d) {
		var K = d.K;
		var colorIndices = json.qmatrices[K-json.K_min].color_perm;
		var body = '<div class="text-center text-tip"><strong>' + 
			popNames[d.population_index] + '</strong><br>' + 
			popSizes[d.population_index] +' samples</div><br>';
		body += '<div><ul>';
		// make combined list of cluster membership and colors for tip swatches
		var swatch = []; 
		for (var j = 0; j < K; j++) {
			swatch.push({'datum': d.indiv_avg[j], 'color': colors[colorIndices[j]]});
		}
		swatch.sort(function(a, b) {
			return((a.datum > b.datum) ? -1 : ((a.datum == b.datum) ? 0 : 1));
		});

		swatch.forEach(function(cluster, i) {
			var datum = Math.round(cluster.datum*1000)/10;
			var color = cluster.color; //colors[colorIndices[i]];

			if(datum >= 0.5) {
				// color swatch:
				body += '<i class="fa fa-circle" style="color: '+
					color+' "></i>';
				body += '&nbsp;<strong> '+datum+'%</strong></li><br>';
			}
		}); // end forEach
		body += '</ul></div>';

		return body;
	}); //end html





// Create a new tour
var tour = new Tour({
	storage: false
});
// Add your steps
tour.addSteps([
    {
    	placement: "top",
    	backdrop: true,
        orphan: true,
        title: "Welcome to pong!",
        content: "This tour will walk you through pong's main features."
    },
    {
        element: ".background:first",
        placement: "bottom",
        title: "The major mode plot",
        content: function() { 
        	return "This plot shows a representative run of the major mode for K = " +
        	json.K_min + ". You can zoom in and out of the plots by placing your cursor " +
        	"above the plot and performing a mouse scroll. Clicking on a color within " +
        	" a plot will highlight that color across K values in all plots (including minor modes).";
        }
    },
    {
        element: "#major_repstring:first",
        placement: "right",
        title: "Runs represented",
        content: function() { 
        	return "Hovering here shows you which runs are represented by the major mode plot for K = " + json.K_min + ", sorted by runID.";
        }
    },
    {
        element: ".majorPopLabels",
        placement: "top",
        title: "Population labels",
        content: function() { 
        	return "Clicking on a population label will highlight that population across K values. Shift-" +
        	"clicking allows you to select multiple populations.";
        }
    },
    {
        element: ".pbDiv:last",
        placement: "right",
        title: "Print and download",
        content: "These icons let you print a plot or download it locally as a PNG or SVG."
    },
    {
        element: ".print-download",
        placement: "top",
        title: "Print and download everything",
        content: "Alternatively, use these buttons to print/download all currently displayed plots in one file."
    },
    {
        element: "button.modes:last",
        placement: "left",
        title: "Minor modes",
        content: "If there is multimodality for a given K value, you can click on this " +
        "button to see representative runs for the minor mode(s)."
    },
    {
        orphan: true,
        placement: "top",
        backdrop: true,
        title: "That's the bulk of it!",
        content: "Consult the documentation to find out more about pong's features. " +
        "Feel free to reach out to us directly if you have any questions or feedback. " +
        "We hope you enjoy using pong!"
    }

]); 
// Initialize method on the Tour class. Get's everything loaded up and ready to go.
tour.init();
$("#help").on("click", function() {
	tour.restart();
});



// print all plots of default visualization
$(document).on('click','#printAllPlots', function(){
	saveAllChild('no', 'print');
});

// print plots in a modal
$(document).on('click', '.printModal', function() {
	var K = $(this)[0].id;
	saveAllChild(K, 'print');
});

//download all plots of default visualization as png
$(document).on('click','#main_png', function(){
	saveAllChild('no', 'png');
});

//download all plots of default visualization as svg
$(document).on('click','#main_svg', function(){
	saveAllChild('no', 'svg');
});

//download all plots of modal visualization as png
$(document).on('click','.downloadModalPNG', function(){
	var K = $(this)[0].id;
	saveAllChild(K, 'png');
});

//download all plots of modal visualization as svg
$(document).on('click','.downloadModalSVG', function(){
	var K = $(this)[0].id;
	saveAllChild(K, 'svg');
});

/* ======================== PRINTING & DOWNLOADING ========================= */

//adding a button to print all barplots in a dialog
var addModalFooter = function(K) {
	var myreply = "reply_Modal(this)";
	var footer = d3.select('#modal_body_'+K)
		.append('div').attr('class', 'modal-body')
		.append('div').attr('class', 'row')
		.append('div').attr('class', 'text-center');
	var footer_print = footer.append('button').attr('type', 'submit')
		.attr('class', 'btn btn-default printModal').attr('id', K)
		.text('Print all modes at K='+K);

	var footer_download = footer.append('div')
		.attr('class', 'dropdown dropdown-toggle modalDropdown');
	var icon = footer_download.append('a')
		.attr('class', 'dropdown')
		.attr('data-toggle', 'dropdown')
		.attr('aria-expanded',"false").append('div')
		.attr('class', 'btn btn-default').text('Download all modes at K='+K);
	addDropdownMenu(footer_download, K, icon, true);
} //end addModalFooter

var addDropdownMenu = function(footer_download, myID, icon, multiPlot_minor) {
	var download_ul = footer_download.append('ul')
		.attr('class', 'dropdown-menu download-menu')
		.attr('id', myID+"_dropdown");

	var slider = download_ul.append('div')
		.attr('class','slider')
		.style('margin','10px')
		.style('margin-left', '15px')
		.style('margin-right', '15px')
		.style('font-size', '12px')
		.attr('id', 'slider_div_' + myID);
	slider.append('div').attr('class', 'img_slider').text("Image size");
	slider.append('div').attr('id','slider_' + myID);

	slider.on('click', function() {
	   	d3.event.stopPropagation();
	   	d3.event.preventDefault();
	});

	var slider_axis = slider.append('div')
		.attr('class', 'slider_axis')
		.style('display', 'flex')
		.style('justify-content', 'space-between')
		.style('width','100%')
		.style('font-size', '9px');
	slider_axis.append('div').text("Smaller");
	slider_axis.append('div').text("Larger");

	var pngButton = download_ul.append('li')
		.append('a').attr('data-format', 'png')
		.attr('title', 'Download plot as PNG')
		.text("PNG");
	var svgButton = download_ul.append('li')
		.append('a').attr('data-format', 'svg')
		.attr('title', 'Download plot as SVG')
		.text("SVG");

	if (multiPlot_minor){
		pngButton.attr('class', 'downloadModalPNG').attr('id', myID);
		svgButton.attr('class', 'downloadModalSVG').attr('id', myID);
	} else {
		pngButton.attr('id', myID + "_png");
		svgButton.attr('id', myID + "_svg");
	}

		//generate alert about downloading in browsers that do not support it
	if (!Modernizr.adownload){
		icon.attr('data-toggle', 'tooltip')
			.attr('data-placement', 'top')
			.attr('title', 'Download not fully supported in this browser.' +
				" Please save the following page after selecting a file " +
				"type to download locally.");
		svgButton.append('tspan')
		.text(" (Save with format 'Page Source')")
		.style('font-size', '10px');
	}

	$("#slider_" + myID).slider({ value: 2, min: 1, max: 3, step: 0.5});
}

//create and position for print button glyph
var createbuttons = function(svg, K, currentPlot, is_minor, K_min, type) {
	if(!is_minor) {
		var pbDiv = d3.select('body').append('div').attr('class', 'pbDiv')
			.style('top', (svgHeight*1.125)*(K-K_min+1)+110 + 'px'); 
		var myID_print = currentPlot.major_mode_runid + "_print";
		var myID_download = currentPlot.major_mode_runid + "_download";
	}
	if(is_minor) { 
		// minor_index = the "index" of this plot, out of all the plots in modal
		var pbDiv = d3.select('#modal_body_'+K)
			.append('div')
			.attr('class', 'pbDiv');
		var myID_print = svg[0][0].getAttribute('id').slice(4) + "_print";
		var myID_download = svg[0][0].getAttribute('id').slice(4) + "_download";
		var runID = (svg[0][0].getAttribute('id').slice(4))
					.slice(0,svg[0][0].getAttribute('id')
						.slice(4)
						.indexOf("_minor"));
		var keyList = Object.keys(currentPlot.modes);
		var sortedMinorKeys = sortKeyList(currentPlot, keyList);
		// 0 for major mode rep run
		var minor_index = sortedMinorKeys.indexOf(runID);

		if(minor_index==0) { //the major mode rep run
			pbDiv.style('top', svgHeight*0.5*(-1) + 'px');
		}
		else {
			pbDiv.style('top', ((svgHeight*1.125)*(minor_index-1))+130 + 'px');
		}
	}

	var left = "32px";
	pbDiv.style('position', 'absolute')
		.style('display', 'inline-flex')
		.style('left', left);

	// add print button in a div
	var icon = pbDiv.append('a').attr('id', myID_print)
		.style('margin', '4px')
		.append('span')
		.attr('class', 'glyphicon glyphicon-print');
	
	//give title to print button on mouseover, and set position
	if(!is_minor){
		icon.attr('title', "Print K=" + K + " barplot");
		icon.attr('id', "print-major-"+K);
	} else {
		icon.attr('title', "Print " + runID + " barplot");
		icon.attr('id', "print-minor-"+runID);
	}
	
	pbDiv = pbDiv.append('div')
		.attr("class", "dropdown")
		.style('margin', '4px');
	var icon = pbDiv.append('a').attr('id', myID_download)
		.attr('data-toggle', 'dropdown')
		.attr('class', 'dropdown-toggle')
		.attr('aria-expanded', 'false')
		.attr('aria-hadpopup', 'true')
		.append('span').attr('class', 'glyphicon glyphicon-download-alt');

	addDropdownMenu(pbDiv,myID_download,icon, false);
	if (!is_minor){
		icon.attr('id', "download-major-"+K);
	}else {
		icon.attr('id', "download-minor-"+runID);
	}
	
} //end createbuttons

//scale factor for png resolution
var scale_factor = 2.0;

function determine_scalefactor(runID, multi_plot, command){
	var curr_slider = $("#slider_main");
	
	if (multi_plot && runID !='no'){ 
		// if saving multiple svgs and they are minor modes
		curr_slider = $("#slider_" + runID);
	} else if (runID !='no') { // if saving a minor mode
		curr_slider = $("#slider_" + runID + "_download");
	}

	if (command == 'png' && multi_plot) {
		return curr_slider.slider('option','value')*0.5;
	}
	return curr_slider.slider('option','value');
}

function downloadSVG(svg, filename) {
	var hiddenDownload = document.createElement('a');
	hiddenDownload.href = svg.src;
	hiddenDownload.type = "hidden";
	hiddenDownload.download = filename;
	document.body.appendChild(hiddenDownload);
	hiddenDownload.click();
	document.body.removeChild(hiddenDownload);
}

function downloadPNG(canvas, filename) {
	var hiddenDownload = document.createElement('a');
	hiddenDownload.href = canvas.toDataURL('image/png');
	hiddenDownload.type = "hidden";
	hiddenDownload.download = filename;
	document.body.appendChild(hiddenDownload);
	hiddenDownload.click();
	document.body.removeChild(hiddenDownload);
};

// save an SVG, needs functionality for if it is a 
// minor mode (getting pop and side labels)
function saveSVG(currentPlot, is_minor, svg, runID, command) {
	scale_factor = determine_scalefactor(runID, false, command);
	//select svg and get pop labels
	var mysvg = d3.select('#plot'+runID).node();
	var poplabels = d3.select(".majorPopLabels").node();
	var popLabelDim = [poplabels.getBoundingClientRect().width + 5, poplabels.getBoundingClientRect().height + 5];

	var date = new Date();
	var timestamp = date.getFullYear() + "-" + date.getMonth() + "-" +
		date.getDate() + "_" + date.getHours() + "h" + date.getMinutes() +
			"m" + date.getSeconds() + "s";
	var filename = "K=" + d3.select('#plot'+runID)
		.attr("class")
		.split(' ')[1] + "_majormode_" + timestamp + "_pong";

	if(is_minor) {
		var is_first = mysvg.getAttribute('class').split(' ');
		var kVal = is_first[0].slice(mysvg.getAttribute('class')
			.indexOf("-")+1);
		if (is_first.length < 2){
			filename = runID.substr(0, runID.indexOf("_")) + "_K=" + kVal +
				"_minormode_" + timestamp + "_pong";
		} else {
			filename = runID.substr(0, runID.indexOf("_")) + "_K=" + kVal +
				"_majormode_" + timestamp + "_pong";
		}

		poplabels = d3.select(".minorPopLabels_"+kVal).node();
		d3.select(".minorPopLabels_"+kVal).attr('height', popLabelDim[1])
			.attr('width', popLabelDim[0]);
	}
	//get size of population labels
	var svg_bbox = mysvg.getBoundingClientRect();

	//create new canvas to display the image
  	var canvas = document.createElement('canvas');
	canvas.width = (Math.max(popLabelDim[0], svg_bbox.width/zoom.scale()) )*scale_factor + 20;
	canvas.height = (popLabelDim[1] + svg_bbox.height)*scale_factor + 20;

	if (command=="print") {
		var w = window.open();
		w.document.title = "pong download";
	}

	if (command=='svg') {
		var svg1 = document.createElementNS('http://www.w3.org/2000/svg',
			'svg');

		svg1.setAttribute('width', Math.max(popLabelDim[0], svg_bbox.width/zoom.scale()));
		svg1.setAttribute('height', (popLabelDim[1] + svg_bbox.height));
		svg1.appendChild(mysvg.cloneNode(true));

		var newlabels = poplabels.cloneNode(true);
		newlabels.setAttribute('y', (svg_bbox.height));
		svg1.appendChild(newlabels);

		importSVG(svg1, null, 0, function(full_svg){
			downloadSVG(full_svg, filename + '.svg');
			if (is_minor){
				d3.select(".minorPopLabels_"+kVal).attr('height', svgHeight)
					.attr('width', svgWidth);
			}
		});
		
	} else {
	    importSVG(mysvg, canvas, 0, function(img) {
			importSVG(poplabels, canvas, (svg_bbox.height)*scale_factor, function(labs) {
				if (command=="print"){
					w.document.body.appendChild(img);
					w.document.body.appendChild(labs);
		    		w.print();
			    } else {
				    downloadPNG(canvas, filename+'.png');
				}
				if (is_minor){
					d3.select(".minorPopLabels_"+kVal).attr('height', svgHeight)
						.attr('width', svgWidth);
				}
			});
		});
	}
} //end saveSVG

//code to generate all major mode plots
function saveAllChild(minor, command) {
	scale_factor = determine_scalefactor(minor, true, command);

	var labels = d3.select(".majorPopLabels").node();
	var popLabelDim = [labels.getBoundingClientRect().width + 5, labels.getBoundingClientRect().height + 5];

	var date = new Date();
	var timestamp = date.getFullYear() + "-" + date.getMonth() + "-" +
		date.getDate() + "_" + date.getHours() + "h" + date.getMinutes() +
			"m" + date.getSeconds() + "s";

	var filename = "mainviz_" + timestamp + "_pong";
	var allSVGs = document.getElementsByClassName('majorSVG');

	if(minor!='no') { //minor will be a value of K
		allSVGs = document.getElementsByClassName('minorSVG-'+minor);
		filename = "modes_K=" + minor + "_" + timestamp + "_pong";

		labels = d3.select(".minorPopLabels_"+minor).node();
		d3.select(".minorPopLabels_"+minor).attr('height', popLabelDim[1])
			.attr('width', popLabelDim[0]);
	}
	
	var svg_bbox = d3.select(allSVGs[0]).node().getBBox();

	var canvas = document.createElement('canvas');
	canvas.width = (Math.max(popLabelDim[0], svg_bbox.width/zoom.scale() ))*scale_factor;
	canvas.height = (popLabelDim[1] + (svg_bbox.height + 20)*allSVGs.length) *scale_factor;
	
	if (command == 'print'){
		var w = window.open();
		w.document.title = "pong download";
	}
	var count = 0;

	var svg1 = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
	svg1.setAttribute('width', Math.max(popLabelDim[0], svg_bbox.width/zoom.scale()));
	svg1.setAttribute('height', (popLabelDim[1] + (svg_bbox.height + 20)*allSVGs.length));

	for (var i=0; i<allSVGs.length; i++) {
		var svg = d3.select(allSVGs[i]);

		if (command=='svg') {
			var newsvg = d3.select(allSVGs[i]).node().cloneNode(true);
			newsvg.setAttribute('y', (svg_bbox.height+20)*i);
			svg1.appendChild(newsvg);

			count +=1;
			if (count == allSVGs.length) {
				var newlabels = labels.cloneNode(true);

				newlabels.setAttribute('y', (svg_bbox.height+20)*allSVGs.length);
				svg1.appendChild(newlabels);

				importSVG(svg1, null, 0, function(full_svg) {
					downloadSVG(full_svg, filename + '.svg');
					if (minor != 'no'){
						d3.select(".minorPopLabels_"+minor).attr('height', svgHeight)
							.attr('width', svgWidth);
					}
				});	
			}
		} else {
			importSVG(svg.node(), canvas, 
				(svg_bbox.height+20)*i*scale_factor, function(img) {

				if (command=='print'){
					w.document.body.appendChild(img);
				}
				count +=1;
				if (count== allSVGs.length) {
					importSVG(labels, canvas, 
						(svg_bbox.height+20)*allSVGs.length*scale_factor,
							function(labs) {
						if (command == "print") {
							w.document.body.appendChild(labs);
							w.print();
						} else if (command=='png'){
							downloadPNG(canvas,  filename + '.png');
						}
						if (minor != 'no'){
							d3.select(".minorPopLabels_"+minor).attr('height', svgHeight)
								.attr('width', svgWidth);
						}
					});
				}
			});
		}
	}
} //end saveAllChild

// from magi (edited)
// https://github.com/raphael-group/magi/blob/master/public/js/save.js
// MAGI developers adapted from 
// https://svgopen.org/2010/papers/62-From_SVG_to_Canvas_and_Back/index.html#svg_to_canvas
function importSVG(sourceSVG, targetCanvas, height, callback) {
	var svg_xml = (new XMLSerializer()).serializeToString(sourceSVG);
	
	// this is just a JavaScript (HTML) image
	var img = new Image();
	// https://developer.mozilla.org/en/DOM/window.btoa
	img.src = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svg_xml)));

	if (targetCanvas) { 
		var ctx = targetCanvas.getContext('2d');
		img.onload = function() {
			// after this, Canvas’ origin-clean is DIRTY
			ctx.drawImage(img, 0, 0, img.width, img.height, 0, height,
				img.width * scale_factor, img.height *scale_factor);
			if (callback){
	  			callback(img);
	  			img.onload = null;
	  		}

		}
	} else {
		callback(img);
	}
} //end importSVG

// sort clusters correctly
// e.g. ["c1", "c2", "c12"] rather than ["c1", "c12", "c2"]
function sortCluster(a,b) {
	var regNum = /[^0-9]/g;
	var aNum = parseInt(a.replace(regNum, ""), 10);
	var bNum = parseInt(b.replace(regNum, ""), 10);
	return aNum === bNum ? 0 : aNum > bNum ? 1 : -1;
}

addDropdownMenu(d3.select('#downloadAllDiv'), 'main',
	d3.select('#downloadAllDropdownLink'), false);

}); //end document ready

