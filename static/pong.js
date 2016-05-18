$(document).ready(function() {

// force scrolling to the top of the page on reload s.t. loading screen displays correctly
$(window).on('beforeunload', function() {
    $(window).scrollTop(0);
});

$('#loading').fadeIn();

/* SET EVERYTHING UP */
var windowWidth = window.innerWidth;
var windowHeight = window.innerHeight;
var svgWidth = windowWidth*0.9;
var svgHeight = 160; // this could maybe be user-defined?

var all_svg, minor_svg, json; // main global variables
var popNames, popSizes; // var popNum, popOrder;
var plotWidth;
var indivWidth;
var plotHeight = svgHeight*0.8;
var labelFontSize = 20; // or can we get this directly from the CSS?
var labelRotate = 45;
var labelDistFromPlot = 17;
var xStart;
	
// Default color scheme (overwritten if custom colors provided). WHAT IF THERE ARE >9 CLUSTERS?
var colors = colorbrewer.Set1[9];
var colors_26 = ["#f0a3ff", "#0075dc", "#993f00", "#4c005c", "#191919", "#005c31",
	"#2bce48", "#ffcc99", "#808080", "#94ffb5", "#8f7c00", "#9dcc00", "#c20088", "#003380", "#ffa405",
	"#ffa8bb", "#426600", "#ff0010", "#5ef1f2", "#00998f", "#e0ff66", "#740aff", "#990000", "#ffff80",
	"#ffff00", "#ff5005"]

var queue = 0; // number of plots queued
var json;

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
socket.onmessage = function(e) {
	var data = JSON.parse(e.data);

	if (data.type == 'pong-data') {
		json = data.pong;
		boolBarchart = json.barchart
		sim_threshold = json.sim_threshold //sim_threshold

		// update queue and loading screen
		// Unless pong changes s.t. tornado app calls pong, loading screen should always
		// occur when receiving pong-data because this will only happen on window load.
		$('#loading').fadeIn();
		queue += json.qmatrices.length;

		popNames = json.popNames;
		popSizes = json.popSizes
		if (json.colors.length > 0) { 
			colors = json.colors; // use custom colors if they exist
		}
		else if (json.K_max > 9) {
			colors = colors_26;
		}
		all_svg = new Array();

		for (i=0; i<json.qmatrices.length; i++) {

			//appending major mode rep runs
			majorID = json.qmatrices[i].major_mode_runid;
			plot = d3.select('#visualization').append('svg')
					.attr("width", svgWidth)
					.attr("height", svgHeight+15)
					.attr('class', 'majorSVG')
					.attr("id", "plot"+majorID);
			all_svg.push(plot);
			getQmatrix(majorID, 'no', null, null);
		}


	} //end pong-data

	else if (data.type == 'q-matrix') {
		var is_minor = data.minor;
		var minorID = data.minorID;
		var is_first = data.is_first;

		if(is_minor=='no') generateVis(d3.select('#plot'+data.name), data.K, data.matrix2d, data.minor, minorID, is_first, boolBarchart, -9); //data.matrix3d); 
		else generateVis(d3.select('#plot'+data.name+'_minor'), data.K, data.matrix2d, data.minor, minorID, is_first, boolBarchart, sim_threshold); //data.matrix3d); //sim_threshold; shouldn't need threshold to be passed in line above when main viz is generated

	} //end q-matrix
}
// socket.onclose = function(evt) { console.log('CONNECTION CLOSE'); };
// socket.onopen = function(evt) { console.log('CONNECTION OPEN'); };


//sends server info about the matrix to get the qmatrix
var getQmatrix = function(matrixID, is_minor, minorID, is_first) {
	socket.send(JSON.stringify({ 'type':'get-qmatrix', 'name': matrixID, 
		'minor': is_minor, 'minorID': minorID, 'is_first': is_first }));
}

var generateVis = function(svg, K, qMatrix2D, is_minor, minorID, is_first, boolBarchart, sim_threshold) {
	if(is_minor=='yes') var indivHeight = plotHeight*0.85;
	else var indivHeight = plotHeight;

	var numIndiv = qMatrix2D.length;
	var colorPerm = json.qmatrices[K-json.K_min].color_perm;
	if(is_minor=='yes') {
		minorWidth = svgWidth*0.75;
		plotWidth = minorWidth*0.84;
		xStart = 0;
		translate = minorWidth*0.08;
	} else {
		plotWidth = svgWidth*0.84;
		translate = svgWidth*0.08;
		xStart = 0;
	}
	indivWidth = plotWidth/numIndiv; // or Math.ceil(plotWidth/numIndiv);

	var currentPlot = json.qmatrices[K-json.K_min];
	var majorID = currentPlot.major_mode_runid;

	//keyList is a list of minor mode ids for a K value
	var keyList = Object.keys(currentPlot.modes);
	var major = keyList.indexOf(majorID);
	if(major > -1) {keyList.splice(major, 1);}

	var sortedMinorKeys = sortKeyList(currentPlot, keyList); //minor IDs of current K val
	//keyList should be in order
	if(keyList.length!=0 && is_minor=='no') { 
		queue += keyList.length+1; // one more because we're going to re-add the major mode at the top of the modal	
		buttons(K, sortedMinorKeys);
	} 

	if(is_minor=='no') {
		printLabels(svg, K, currentPlot);
		similarity(svg, K, majorID);
	}
	else printMinorLabels(svg, currentPlot, minorID, is_first);

	var translatey = 15;
	var wrap = svg.append('g').attr('transform', 'translate('+ translate + ', ' + translatey +')'); //SR changed y translate from 0 to push svg down so Avg sim could be seen.
	var plot = wrap.append('svg')
				.attr('class', 'plotSVG')
				.attr('width', plotWidth)
				.attr('id', 'plotSVG_'+majorID);
	
	if(boolBarchart) { 
		//stacked rects
		var indivs = plot.append('g').attr('class', 'indiv');
		for (c = 0; c < K; c++) { // for each cluster
			if(is_minor=='yes' && is_first=='no')
				var indivClass = minorID+"_minorCluster"+(colorPerm[c]).toString();
			else var indivClass = "cluster"+(c+1).toString();
			var cluster = indivs.selectAll("rect."+indivClass).data(qMatrix2D).enter().append("rect"); //each datum is an individual
		//creates rectangles like DISTRUCT, but adds computational time O(N*K per plot) versus O(K) with line charts
			cluster.attr({ 
				x: function(d,i) { //d is basically one q matrix row
					return xStart + i*(indivWidth);
				}, 
				y: function(d) { //returns the y of where the rectangle starts
					h = 0; // sum of heights of all previous clusters (count backwards to flip vertical order)
					// note that if we wanted to flip it back, we would go from 0 < c, instead of c+1 < K
					for (x = c+1; x < K; x++) {
						h = h + d[x]*indivHeight; //d[x] is one number in the matrix array, any number but first
					}
					return h; //total percentage of indivHeight for one row of q matrix, except for d[0]
				},
				width: indivWidth,
				height: function(d) {return d[c]*indivHeight; }, 
				class: indivClass
			}); //end cluster attr
			cluster.style("fill", colors[colorPerm[c]]).style("stroke", colors[colorPerm[c]]); //order of filling colors
		} //end for
	}
	else {
		var clusters = plot.append('g').attr('class', 'clustergroup').attr('id', 'clusters_'+K); //LINE_CHART
	
		var xScale = d3.scale.linear().range([0, plotWidth]).domain([0, numIndiv-1]); //LINE_CHART
		var yScale = d3.scale.linear().range([0, indivHeight]).domain([0, 1]);

		for (c = 0; c < K; c++) { // for each cluster
		
		var cluster_c = new Array(); //LINE_CHART needs each cluster as a list
		for (i = 0; i < numIndiv; i++) {
			cluster_c.push([i,qMatrix2D[i][c]]);
		}
		if(is_minor=='yes') var clusterClass = minorID+"_minorCluster"+(colorPerm[c]).toString();
		else var clusterClass = "cluster_"+K+'_'+(c+1).toString();

		//d3.svg.area generating function for each of the K polygons
		var cluster_lineGen = d3.svg.area().x( 
		  	function(d) {
		  		return xScale(d[0]); 
		  	}).y1(
		  	function(d) {
		 		myy = d[1];
		 		for (clus = c+1; clus < K; clus++) {
		 			myy = myy + qMatrix2D[d[0]][clus];
		 		}
		 		return yScale(myy);
			}).y0(
			function(d) {
				return yScale(0);
			}).interpolate("linear")//.interpolate("linear").tension(0)//
		; //end cluster_lineGen

		clusters.append('svg:path').attr('class', clusterClass).attr('id', 'clusters_'+K+'_'+c).attr("d", cluster_lineGen(cluster_c)).attr('stroke', colors[colorPerm[c]]).attr('stroke-width', 0.3).attr('fill', colors[colorPerm[c]]);//.attr('fill', 'none');//; //LINE_CHART

		} //end for
	}
	
	//pops are the invisible rectangles used for mouseover later
	var pops = plot.append('g').attr('class', 'pop');
	if(is_minor=='yes') {
		var minorPops = plot.append('g').attr('class', 'minorPop'+K);
	}
	
	var prevWidth = xStart, currentWidth = xStart, xval = xStart; 

	//population delineations:
	if(popSizes!=null) {
		for(var i=0; i<popSizes.length; i++) {

			pops.call(tip);

			//these are the invisible population rectangles for mouseover
			if(is_minor=='no') {
				var population = pops.selectAll('rect') //one datum is all the indivs in one population
					.data(json.indiv_avg[majorID])
					.enter()
					.append('rect')
					.on("mouseover", tip.show)
					.on('mouseout', tip.hide);
			} else {
				var population = minorPops.selectAll('rect') //one datum is all the indivs in one population
					.data(json.indiv_avg[minorID])
					.enter()
					.append('rect')
					.on('mouseover', minorTip.show)
					.on('mouseout', minorTip.hide);

			} //else


			//grab currently highlighted populations onclick
			d3.select('#vizButton').on('click', function() {
				var vizPops = new Array(); //array of class names of populations clicked
				for(popNum=1; popNum<popSizes.length+1; popNum++) { //from 1 to number of populations
					var currentPopClass = '.pop'+popNum.toString();
					if(d3.selectAll(currentPopClass).style('fill')=='rgba(0, 0, 0, 0)') {
						vizPops.push(currentPopClass);
					}
				} //end for
				d3.selectAll('.modal-title-viz')
					.html(function() {
					var head = '<h2>Visualizing populations:  </h2>';
					var str = '';
					for(i in vizPops) {
						var o = vizPops[i].indexOf('o'); //get index of 'o'
						var num = vizPops[i].substring(o+2); //get population number
						var popName = popNames[num-1];
						str+=popName + ', ';
					}
					return head+'<h3 style="color: rgb(70, 184, 218)">' //twitter blue
							+str.substring(0, str.length-2)+'</h3>'; //to cut off last comma
				})
			}); //end viz click

			//when dialog box opens, enable d3 tip:
			d3.selectAll('.modes').on('click', function() {
				var id = this.id;
				var k = id.split('-')[1];

				d3.selectAll('.minorPop'+k).call(minorTip);
			}) 

			population.attr({
				class: function(d,i) {
					if(is_minor=='no') return 'popNum pop'+(i+1);
					else return 'minorPopNum minorPlot'+minorID; //use minorID here to specify between plots
				},
				id: function(d,j) {
					if(is_minor=='no') return 'k'+K +'p'+(j+1); //j+1 is population number
					else return 'minor_'+minorID+'_p'+(j+1);
				},
				// id: function(d,i) {return popOrder[i]},
				x: function(d,i) { //d is length of one pop, i goes to popOrder.length
					var x = xval;
					xval += popSizes[i]*indivWidth;
					return x;
				},
	
				y: 0,
				width: function(d,i) { return popSizes[i]*indivWidth; },
				height: indivHeight
			});

			 population.style('fill', 'transparent');
			 population.style('stroke', 'black');


			prevWidth = currentWidth;
			currentWidth += popSizes[i]*indivWidth;

		} //end for

	} //end population delineations

	//greying out minor clusters that are different from the major modes //sim_threshold - this is where the action must happen
	
	
	d3.select('#whiteout'+K).on('click', function() {
		for(i in sortedMinorKeys) {
			greyOutSim(K, sortedMinorKeys[i], colorPerm, indivWidth, boolBarchart);
		}
	});

	//all other populations in plot grey out when one population clicked
	d3.selectAll('.popNum').on('click', function() {
		var id = this.id;
		var p = id.indexOf('p');
		var pop_num = id.substring(p+1);

		if(d3.event.shiftKey) { //if the shift key is held down 
			//just highlight the population clicked; don't grey out extras
			d3.selectAll('.pop'+pop_num.toString()).style('fill', 'transparent');
		} else {
			//grey all pops in that plot
			var majorGrey = d3.selectAll('.popNum')
					.style('fill', 'grey')
					.style('opacity', '0.85');
			//clear out clicked population
			d3.selectAll('.pop'+pop_num.toString())
					.style('fill', 'transparent');
			
		} //end else
	}); //end d3 select major


	//when clicked outside plot, all pops no longer greyed out
	$(document).mouseup(function (e) {
	    var plot = $(".popNum");
	    var button = $('.buttonDiv');
	    var vizButton = $('#vizButton');
	    //dialog mouseup:
	    var dialog = $('.modal-content'); //inside dialog box

	    if (!plot.is(e.target) && !button.is(e.target) && !vizButton.is(e.target) // if the target of the click isn't the container
	    	&& plot.has(e.target).length === 0 
	    	&& button.has(e.target).length === 0
	    	&& vizButton.has(e.target).length === 0) // nor a descendant of the container
	    		
	    		plot.css('fill', 'transparent');
	    if(!dialog.is(e.target) && dialog.has(e.target).length===0) {
	    	$('.close').click();
	    	//tried to reset state of dialog box upon closing but this is quite hard.
	    }
	}); //end mouseup	

	if(is_minor=='no' && qMatrix2D[0].length==json.K_max) {
		var labels = d3.select('#visualization').append('svg')
			.attr('class', 'majorPopLabels')
			.attr('width', svgWidth)
			.attr('height', indivHeight+'px').append('g');
		var labelsDim = addPopLabels(labels, 'no', K);
		var labelsSVG = d3.select('#visualization').select('.majorPopLabels');
		labelsSVG.attr('height', labelsDim[0]).attr('width', labelsDim[1]);
	}
	if(is_minor=='yes' && minorID==sortedMinorKeys[sortedMinorKeys.length-1]) {
		var labels = d3.select('#modal_body_'+K).append('svg')
			.attr('class', 'minorPopLabels_'+K)
			.attr('width', svgWidth*0.75)
			.attr('height', indivHeight+'px').append('g');
		var labelsDim = addPopLabels(labels, 'yes', K);
		addModalFooter(K);
	}

	//creating print buttons for major modes; //for minor mode we probably need minorID
	printbuttons(svg, K, currentPlot, is_minor, json.K_min); 
	if(is_minor=='no') {
		var myID = currentPlot.major_mode_runid;
	}
	if(is_minor=='yes') {
		var myID = svg[0][0].getAttribute('id').slice(4);
	}
	$('#'+myID+'_print').click(function(e) {
	  e.preventDefault();
	  saveSVG(currentPlot, is_minor, svg, myID).print(); //print this svg
	});


	queue--;
	if (queue === 0) {
		$('#loading').delay(200).fadeOut();
	}




} //end generateVis



/*************************  ALL HELPER FUNCTIONS GO HERE  *************************/

var addPopLabels = function(labels, is_minor, K) {
	var prevWidth = translate, currentWidth = translate, xval = translate; 
	for(i in popNames) {
		prevWidth = currentWidth;
		currentWidth += popSizes[i]*indivWidth;

		var labelx = prevWidth + 0.5*(currentWidth-prevWidth) - 0.5*labelFontSize; // the last term is only if the labels are rotated 90 degrees
				var labely = labelDistFromPlot;
				var labeltransform = 'translate('+labelx+','+labely+')rotate('+labelRotate+')';
				
				//unique pop id for selection
				if(is_minor=='yes') popid = "minor_"+K+"_pop"+i;
				else popid = "major_pop"+i; 

				var pop = labels.append("text").text(popNames[i])
								.attr('class','x-axis')
								.attr('transform',labeltransform)
								.style('font-size','12px')
								.style('font-family','Helvetica, sans-serif')
								.attr('id', popid);
	} //end for
	if(is_minor=='no') return(getLabelDim("major_pop", "majorPopLabels"));
} //end addPopLabels

//updating svg dim
var getLabelDim = function(handle, label){
	labelsvg = d3.select('.'+label).select('g').node();
 	return [labelsvg.getBBox().height+15, labelsvg.getBBox().width+labelsvg.getBBox().x+15]
} //end getLabelDim

var buttons = function(K, sortedMinorKeys) {
	var buttonDiv = d3.select('body').append('div').attr('class', 'buttonDiv');
	var button = buttonDiv
		.append("button")
        .attr("class","modes btn btn-info btn-lg")
        .attr('data-toggle', 'modal')
        .attr('data-target', '#modal-'+K.toString()) //myModal
		.attr("id", 'button-'+K);

	button.style('position', 'absolute')
			.style('top', 129+(svgHeight+20)*(K-json.K_min)+98 + 'px') //this is fixed; be done in a more symbolic way
			.style('left', (translate + svgWidth*0.84 + 20).toString() + 'px'); //previously (svgWidth-35).toString() + 'px');


	button.html('<i class="fa fa-plus"></i> <span style="font-weight:bold; font-size:125%;">'+sortedMinorKeys.length+'</span>');


	modal(K, sortedMinorKeys, button, buttonDiv, false);
}

var modal = function(K, sortedMinorKeys, button, buttonDiv, viz) {
	var modal_fade = buttonDiv.append('div')
								.attr('class', 'modal fade')
								.attr('id', function() {
									if(viz==false) return 'modal-'+K;
									else return 'modal-viz';
									})
								.attr('role', 'dialog');

	var modal_dialog = modal_fade.append('div')
						.attr('class', 'modal-dialog');

	var modal_content = modal_dialog.append('div')
						.attr('class', 'modal-content')
						.attr('id', 'modal-content-'+K)
						.style('width', (svgWidth*.75+80).toString()+'px') //wide so as not to cover the major mode label
						.style('left', (xStart+10).toString()+'px');

	var modal_header = modal_content.append('div')
			.attr('class', 'modal-header')
			.attr('id', function() {
				if(viz==false) return 'title'+K;
				else return 'titleViz';
			});
	var close = modal_header.append('button')
											.attr('type', 'button')
											.attr('class', 'close')
											.attr('data-dismiss', 'modal')
											.text('x');

	var title = modal_header.append('h2')
		.attr('class', function() {
			if(viz==false) return'modal-title';
			else return 'modal-title-viz';
		})
		.html(function() {
			if(viz==false) return 'Clustering modes, K=' + K;
		});

	minor_svg = new Array();

	if(viz==false) {
		var modal_header2 = modal_content.append('div')
			.attr('class', 'modal-header')
			.attr('id', 'modal_header2_'+K);

		//sim_threshold - can I set up checkbox as readonly if index to gray has length 0 across all modes?

		var checkbox = modal_header2.append('label').attr('class', 'checkbox-inline');
		checkbox.append('input').attr('type', 'checkbox')
								.attr('class', 'check-input')
								.attr('id', 'whiteout'+K);	
		checkbox.style('position', 'relative').style('top', '4px');

		var checkbox_caption = modal_header2.append('text')
			.attr('class', 'checkbox-caption')
			.text('\nCheck to highlight multimodality: ');

		//pushing weird major plot:
		var majorID = json.qmatrices[K-json.K_min].major_mode_runid;
		plot = d3.select('#modal_header2_'+K).append('svg')
				.attr("width", svgWidth*0.75)
				.attr("height", svgHeight*0.95)
				.attr("class", "minorSVG-"+K) //class allows the printing of all plots later on
				.attr("id", "plot"+majorID+'_minor');
		minor_svg.push(plot);
		//this major mode acts like minor because it is in the dialog box:
		getQmatrix(majorID, 'yes', majorID, 'yes'); 		
	} //end viz false

	//both viz true and false:
		var modal_body = modal_content.append('div')
			.attr('class', 'modal-body')
			.attr('id', function() {
				if(viz==false) return 'modal_body_'+K;
				else return 'modal_body_viz';
		})

	if(viz==false) {	
		//gets qmatrix for each minor plot
		for (i=0; i<sortedMinorKeys.length; i++) {
			var minorID = sortedMinorKeys[i];
			plot = d3.select('#modal_body_'+K).append('svg')
					.attr("width", svgWidth*0.75)
					.attr("height", svgHeight*0.95)
					.attr("class", "minorSVG-"+K) //added in order to print all plots later on
					.attr("id", "plot"+minorID+'_minor');
			minor_svg.push(plot);
			getQmatrix(minorID, 'yes', minorID, 'no');
		} //end for
	} //viz false
} //end modal

var printLabels = function(svg, K, currentPlot) { 
	var totRuns = currentPlot.total_runs;
	var majorID = currentPlot.major_mode_runid;
	var numMajorRuns = currentPlot.modes[majorID].runs_represented.length;
	var yPos = 0.5*plotHeight+ 0.5*labelFontSize;

	//K labels to the left of the plot
	label = svg.append("text").text("K = "+K.toString()); //K label on left
	label.attr("class","label").style('font', 'bold 20px Helvetica, sans-serif');
	label.attr("x",0).attr("y", yPos);
	//major runs out of total runs under K label
	runs = svg.append('text').text(numMajorRuns+'/'+totRuns+' runs').attr('id', 'major_bigstring');
	runs.attr("x",0).attr("y", yPos+25);
	runs.style('font', '12px Helvetica, sans-serif');

	var bbox = document.getElementById('major_bigstring').getBBox();
	var width = bbox.width;
	if(width > translate) translate = width + 5;

	//puts avg_sim in labels section
	avg_sim = currentPlot.modes[majorID].avg_sim;
	if(avg_sim!=null) {
		sim = svg.append('text')
			.text('Avg pairwise similarity: '+avg_sim.toString().substring(0,5));
		sim.attr('x', translate).attr('y', 10);
		sim.style('fill', 'rgb(70, 184, 218)'); //blue plus button color
		sim.style('font', 'bold 12px Helvetica, sans-serif');
	}
} //end printLabels

var printMinorLabels = function(svg, currentPlot, minorID, is_first) {
	var totRuns = currentPlot.total_runs;
	var numMinorRuns = currentPlot.modes[minorID].runs_represented.length;
	var yPos = 0.5*plotHeight*0.85 + 0.5*labelFontSize;
	//labels to the left
	if(is_first=='yes') 
	{
		major = svg.append('text').text('major mode');
		major.attr('class', 'majorMinorLabel')
			 .attr('id', 'minor_bigstring');
		major.attr('x',0).attr('y', yPos-38-15); //x location to 0 to left align mode text
		major.style('font', 'bold 14px Helvetica, sans-serif')
	}

	if(83.609 > translate) translate = 83.609 + 5; //78.609 is width of label "major mode" - used this fixed value here

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
	runs.attr('class', 'minorRun');
	runs.attr('x',0).attr('y', yPos+30-26);
	runs.style('font', '12px Helvetica, sans-serif');
	//puts avg_sim in labels section
	avg_sim = currentPlot.modes[minorID].avg_sim;
	if(avg_sim!=null) {
		sim = svg.append('text')
			.text('Avg pairwise similarity:' + avg_sim.toString().substring(0,5));
		sim.attr('class', 'avg_sim');
		sim.attr('x', translate).attr('y', 10);
		sim.style('fill', 'rgb(70, 184, 218)'); //blue plus button color
		sim.style('font', 'bold 12px Helvetica, sans-serif');
	} 
	return(0); //return increase in translate
} //end printMinorLabels

var sortKeyList = function(currentPlot, keyList) {
	var minorDict = {};
	for(var i in keyList) {
		var current_minor = keyList[i];
		var current_minor_runs = currentPlot.modes[current_minor].runs_represented.length;
		minorDict[current_minor] = current_minor_runs;
	}
	var items = Object.keys(minorDict).map(function(key) { //put in array format
		return [key, minorDict[key]];
	});	
	// Sort the array based on the second element
	items.sort(function(first, second) { return second[1] - first[1]; });
	var sortedMinorKeys = new Array();
	for(var i in items) {sortedMinorKeys.push(items[i][0])}
	return sortedMinorKeys;
}
//greys out clusters for one minor plot
var greyOutSim = function(K, minorID, colorPerm, indivWidth, boolBarchart) { 
		//greying out minor clusters that are different from the major modes
		var minor_obj = json.qmatrices[K-json.K_min].modes[minorID];
		console.log(minor_obj) //sim_threshold
		console.log("gray_indices for minorID "+minorID+" is = "+minor_obj.gray_indices) //sim_threshold
		if(minor_obj.gray_indices!=null) {
			var gray_indices = minor_obj.gray_indices;

			for(i in minor_obj.gray_indices) {
				var greyOutIndex = colorPerm[gray_indices[i]];
				var cluster_to_grey = '.'+minorID+'_minorCluster'+(greyOutIndex).toString();
				//greys out one color at a time if visible, pops back up if hidden (oncheck)
				var footerButton = d3.select('#modal_body_' + K).select('.downloadModalPDF');
				if(boolBarchart) {
					if(d3.selectAll(cluster_to_grey).style('visibility')=='visible') { //if DISTRUCT rectangles are used
					 	d3.selectAll(cluster_to_grey).style('visibility', 'hidden')
					 	footerButton.classed('btn btn-primary', true).text("Print highlighting multimodality at K="+K);
					}
					else {
						d3.selectAll(cluster_to_grey).style('visibility', 'visible'); //if DISTRUCT rectangles are used
						footerButton.classed('btn-primary', false).text("Print all modes at K="+K);
					}
				}
				else {
					if(d3.selectAll(cluster_to_grey).attr('fill')!='white') {
						d3.selectAll(cluster_to_grey).attr('fill', 'white').attr('stroke', 'white')
						footerButton.classed('btn btn-primary', true).text("Print highlighting multimodality at K="+K);
					}
					else {
						d3.selectAll(cluster_to_grey).attr('fill', colors[colorPerm[gray_indices[i]]]).attr('stroke', colors[colorPerm[gray_indices[i]]])
						footerButton.classed('btn-primary', false).text("Print all modes at K="+K);
					}
				}
			} //end for
		} //end if
}

var similarity = function(svg, K) {
	//adds average similarity between modes in dialog header
	var avg_sim_bt_modes = Math.round(json.qmatrices[K-json.K_min].avg_sim_bt_modes*1000)/1000;
	if(avg_sim_bt_modes!=null)
		simMode = d3.select('#title'+K).append('h4')
					.text('\nAvg pairwise similarity among modes = '+avg_sim_bt_modes);
} //end similarity





//MOUSEOVER TIP
var tip = d3.tip()
	.direction('s') //put southward tooltip underneath svg
	.attr('class', 'd3-tip')
 	.offset(function(d, i) {
 		var t = d3.transform(d3.select(this.parentNode.parentNode.parentNode).attr('transform'))
 		return [t.translate[1],0]
 	})  
	.html(function(d,i) { 
	//d is array of percentages for each population in order of color_perm
	    var K = d.length;
	    var colorIndices = json.qmatrices[K-json.K_min].color_perm;


	    var body = '<div class="text-center"><strong>'+popNames[i]+'</strong><br>'
	    +popSizes[i]+' samples</div><br>';

	    body += '<div><ul>';

	    var swatch = []; //make combined list of cluster membership and colors for tip swatches
	    for (var j=0; j<K; j++) swatch.push({'datum': d[j], 'color': colors[colorIndices[j]]});
	    swatch.sort(function(a, b) {
	    	return((a.datum > b.datum) ? -1 : ((a.datum == b.datum) ? 0 : 1));
	    });

	    swatch.forEach(function(cluster, i) {
	    	var datum = Math.round(cluster.datum*1000)/10;
	    	var color = cluster.color; //colors[colorIndices[i]];

	    	if(datum >= 0.5) {
	    		//color swatch:
	    		body += '<i class="fa fa-circle" style="color: '+color+' "></i>';
	    		body += '&nbsp;<strong> '+datum+'%</strong></li><br>';

	    	}
	    }); //end forEach
	    body += '</ul></div>';

	    return body;
	}); //end html


var minorTip = d3.tip()
	.direction('e')
	.attr('class', 'd3-minorTip')
	.offset(function(d,i) {
		var k = d.length;
		var width = d3.select('#modal-content-'+k).style('width');
		var modalWidth = width.substring(0, width.length-2);
		
		var tipX = this.getBBox().x;
		var tipWidth = this.getBBox().width;
		
		var toolX = tipX+tipWidth;
		var spaceLeft = modalWidth-toolX;

		return [0, spaceLeft-30]; //+30

	})
	.html(function(d,i) { 
	//d is array of percentages for each population in order of color_perm
	    var K = d.length;
	    var colorIndices = json.qmatrices[K-json.K_min].color_perm;

	    var body = '<div class="text-center"><strong>'+popNames[i]+'</strong><br>'
	    +popSizes[i]+' samples</div><br>';

	    body += '<div><ul>';

	    var swatch = []; //make combined list of cluster membership and colors for tip swatches
	    for (var j=0; j<K; j++) swatch.push({'datum': d[j], 'color': colors[colorIndices[j]]});
	    swatch.sort(function(a, b) {
	    	return((a.datum > b.datum) ? -1 : ((a.datum == b.datum) ? 0 : 1));
	    });

	    //d = d.sort().reverse()
	    swatch.forEach(function(cluster, i) {
	    	var datum = Math.round(cluster.datum*1000)/10;
	    	var color = cluster.color; //colors[colorIndices[i]];

	    	if(datum >= 0.5) {
	    		//color swatch:
	    		body += '<i class="fa fa-circle" style="color: '+color+' "></i>';
	    		body += '&nbsp;<strong> '+datum+'%</strong></li><br>';

	    	}
	    }); //end forEach
	    body += '</ul></div>';

	    return body;
	}); //end html


var saveFig = function(plotID, allMajorModes) {
	// if allMajorModes is true, plotID is ignored (it can just be an empty string)
	var name = plotID;

	var serializer = new XMLSerializer();

	if (allMajorModes) {
		name = 'all';
		var source = "<svg>";
		for (var i=0; i<json.qmatrices.length; i++) {
			source += serializer.serializeToString(document.getElementById("plotSVG_"+json.qmatrices[i].major_mode_runid));
		}
		source += "</svg>"
	}
	else {
		var datSVG = document.getElementById("plotSVG_"+name); // get SVG element
		var source = serializer.serializeToString(datSVG); // get svg source
	}
	
	socket.send(JSON.stringify({ 'type':'svg', 'svg':source, 'name':name}));
}

var saveAll = function() {
	var serializer = new XMLSerializer();
	var allSVGs = document.getElementsByClassName('plotSVG');
	var svgdict = new Object();

	for (var i=0; i<allSVGs.length; i++) {
		svgdict[allSVGs[i].id] = serializer.serializeToString(allSVGs[i]); 
	}

	socket.send(JSON.stringify({ 'type':'multi-svg', 'svg-dict':svgdict }));
}

//downloading PDF of default visualization
$(document).on('click','#downloadPDF', function(){
	saveAllChild('no').print();
});

//downloading PDF of a modal
$(document).on('click', '.downloadModalPDF', function() {
	K = $(this)[0].id;
	saveAllChild(K).print();
});

//////////////////////////
////////Printing functions

//adding a button to print all barplots in a dialog
var addModalFooter = function(K) {
	var myreply = "reply_Modal(this)";
	var footer = d3.select('#modal_body_'+K).append('div').attr('class', 'modal-body');
	var footer_download = footer.append('div').attr('class', 'row')
							.append('div').attr('class', 'text-center')
							.append('button').attr('type', 'submit')
							.attr('class', 'btn btn-default downloadModalPDF')
							.attr('id', K)
							.text('Print all modes at K='+K);
} //end addModalFooter

//create and position for print button glyph
var printbuttons = function(svg, K, currentPlot, is_minor, K_min) { 	
	if(is_minor=='no') {
		var pbDiv = d3.select('body').append('div').attr('class', 'pbDiv');
		var myID = currentPlot.major_mode_runid + "_print";
	}
	if(is_minor=='yes') { //minor_index = the "index" of this plot, out of all the plots in modal
		var pbDiv = d3.select('#modal_body_'+K).append('div').attr('class', 'pbDiv');
		var myID = svg[0][0].getAttribute('id').slice(4) + "_print";
		var runID = (svg[0][0].getAttribute('id').slice(4))
					.slice(0,svg[0][0].getAttribute('id').slice(4).indexOf("_minor"));
		var keyList = Object.keys(currentPlot.modes);
		var sortedMinorKeys = sortKeyList(currentPlot, keyList);
		var minor_index = sortedMinorKeys.indexOf(runID); //0 for major mode rep run
	}

	//add print button in a div
	var print = pbDiv.append('a').attr('id', myID)
		.append('span').attr('class', 'glyphicon glyphicon-print');
	if(is_minor=='no') {
		print.attr('id', "print-major-"+K);
	}
	if(is_minor=='yes') {
		print.attr('id', "print-minor-"+runID);
	}

	//give title to print button on mouseover, and set position
	if(is_minor=='no') {
		//figure out where in the K values this plot is

		print.attr('title', "Print K=" + K + " barplot");
		pbDiv.style('position', 'absolute')
			.style('top', svgHeight*1.131*(K-K_min+1)+85 + 'px')
			.style('left', 48 + 'px'); 
	}
	if(is_minor=='yes') {
		print.attr('title', "Print " + runID + " barplot"); 
		pbDiv.style('position', 'absolute')
			.style('left', '48px'); 

		if(minor_index==0) { //the major mode rep run
			pbDiv.style('top', svgHeight*0.95*(-1) + 108.8 -15 + 'px');
		}
		else {
			pbDiv.style('top', (svgHeight*0.95+5)*minor_index + 5 -30 + 'px');
		}
	}
} //end printbuttons

//save an SVG, needs functionality for if it is a minor mode (getting pop and side labels)
var saveSVG = function(currentPlot, is_minor, svg, runID) {
	
	//select svg and get pop labels
	var mysvg = d3.select('#plot'+runID).node();
	
	if(is_minor=='no') {
		var poplabels = d3.select(".majorPopLabels").node();
	}
	if(is_minor=='yes') {
		var kVal = mysvg.getAttribute('class').slice(mysvg.getAttribute('class').indexOf("-")+1);
		poplabels = d3.select(".minorPopLabels_"+kVal).node();
		var oldHeight = poplabels.getAttribute('height');
		var oldWidth = poplabels.getAttribute('width');
		var newDim = getLabelDim("minor_"+kVal+"_pop", "minorPopLabels_"+kVal);
		poplabels.setAttribute('height', newDim[0]);
		poplabels.setAttribute('width', newDim[1]);
	}
	//create new document to display the svg
  	var canvas = document.createElement('canvas'),
    img = importSVG(mysvg, canvas),
    labs = importSVG(poplabels, canvas), 
    w = window.open();

    if(is_minor=='yes') {
    	poplabels.setAttribute('height', oldHeight);
		poplabels.setAttribute('width', oldWidth);
    }

 	w.document.body.appendChild(img);
 	w.document.body.appendChild(labs);

	return w;
} //end saveSVG

//code to generate all major mode plots
var saveAllChild = function(minor) {
	var canvas = document.createElement('canvas');
	if(minor=='no') {
		var allSVGs = document.getElementsByClassName('majorSVG');
		var labels = d3.select(".majorPopLabels").node();
	}
	else { //minor will be a value of K
		var allSVGs = document.getElementsByClassName('minorSVG-'+minor);
		var labels = d3.select(".minorPopLabels_"+minor).node();
		var oldHeight = labels.getAttribute('height');
		var oldWidth = labels.getAttribute('width');
		var newDim = getLabelDim("minor_"+minor+"_pop", "minorPopLabels_"+minor);
		labels.setAttribute('height', newDim[0]);
		labels.setAttribute('width', newDim[1]);
	}
	var svgdict = new Object();
	w = window.open();
	for (var i=0; i<allSVGs.length; i++) {
		var img = importSVG(allSVGs[i], canvas);
		w.document.body.appendChild(img);
	}

	labs = importSVG(labels, canvas);
	w.document.body.appendChild(labs);
	if(minor!='no') {
    	labels.setAttribute('height', oldHeight);
		labels.setAttribute('width', oldWidth);
    }
	return w;
} //end saveAllChild

// from magi - https://github.com/raphael-group/magi/blob/master/public/js/save.js
// MAGI developers adapted from https://svgopen.org/2010/papers/62-From_SVG_to_Canvas_and_Back/index.html#svg_to_canvas
function importSVG(sourceSVG, targetCanvas) {
  var svg_xml = (new XMLSerializer()).serializeToString(sourceSVG);
  var ctx = targetCanvas.getContext('2d');

  // this is just a JavaScript (HTML) image
  var img = new Image();
  // https://developer.mozilla.org/en/DOM/window.btoa
  img.src = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svg_xml)));

  img.onload = function() {
      // after this, Canvas’ origin-clean is DIRTY
      ctx.drawImage(img, 0, 0);
  }
  return img;
} //end importSVG


}); //end document ready

