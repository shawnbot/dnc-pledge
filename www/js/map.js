(function(exports) {

// for brevity!
var gm = google.maps;

// parse query string params
var params = (function(str) {
  if (str.indexOf("=") > -1) {
    if (str.charAt(0) === "?") str = str.substr(1);
    var query = {},
        parts = str.split("&"),
        len = parts.length;
    for (var i = 0; i < len; i++) {
      var part = parts[i].split("="),
          key = part[0],
          val = decodeURIComponent(part[1]),
          num = parseInt(val);
      query[key] = !isNaN(num) ? num : val;
    }
    return query;
  } else {
    return {};
  }
})(location.search);

// map options
var hide = {"visibility": "off"},
    options = {
      "center":           new gm.LatLng(36, -101),
      "zoom":             5,
      "mapTypeId":        gm.MapTypeId.ROADMAP,
      // no UI
      "disableDefaultUI": true,
      // no scroll wheel
      "scrollwheel":      false,
      // styled map API stuff
      "styles": [
        {
          "featureType": "road",
          "stylers": [hide]
        },
        {
          "featureType": "landscape",
          "stylers": [hide]
        },
        {
          "featureType": "poi",
          "stylers": [hide]
        },
        {
          "featureType": "administrative.locality",
          "elementType": "labels",
          "stylers": [hide]
        },
        {
          "stylers": [
            { "saturation": -81 },
            { "gamma": 0.71 }
          ]
        }
      ]
    };

var map = new gm.Map(document.getElementById("map"), options),
    states = [],
    statesByCode = {},
    zips = [],
    zipsByCode = {};

// apparently it's better to get the projection from an overlay than the map
var overlay = new gm.OverlayView();
overlay.draw = function() {};
overlay.setMap(map);

// timer object for recording how long it takes to do stuff
var time = {
  marks: {},
  now: Date.now(),
  reset: function() {
    this.now = Date.now();
  },
  mark: function(key) {
    this.marks[key] = Date.now() - this.now;
    this.reset();
  },
  get: function(key) {
    var ms = this.marks[key];
    return ms > 1000
      ? (ms / 1000).toFixed(1) + "s"
      : ms + "ms";
  }
};

// load zip code data first
d3.csv("data/zips/zips-min.csv", function(rows) {
  time.mark("zips.load");

  // zips[] is our array of zip codes
  zips = rows;
  // and zipsByCode{} is our hash by 5-digit zip code
  zips.forEach(function(row) {
    // coerce lat and lon columns into floats
    row.lat = parseFloat(row.lat);
    row.lon = parseFloat(row.lon);
    zipsByCode[row.zip] = row;
  });

  time.mark("zips.parse");

  // then load state outlines
  // TODO: simplify these?
  d3.json("data/states/all.json", function(collection) {
    time.mark("states.load");

    states = collection.features;
    states.forEach(function(feature) {
      statesByCode[feature.id] = feature;
    });

    // repositioning info for Alaska and Hawaii
    statesByCode.AK.offset = {
      translate: [300, 780],
      scale: .3
    };
    statesByCode.HI.offset = {
      translate: [820, -80],
      scale: 1
    };

    time.mark("states.parse");

    // how long did this all take?
    console.log("%d zips loaded in %s (parsed in %s)", zips.length, time.get("zips.load"), time.get("zips.parse"));
    console.log("%d states loaded in %s (parsed in %s)", states.length, time.get("states.load"), time.get("states.parse"));

    // wait for the projection, then init
    waitForProjection(init);
  });
});

var proj;
/*
 * This function is stupid. In some cases (can't figure out why), the
 * projection is null until (presumably) the map initializes, but there's no
 * event telling us when we should expect it. So we wait 100ms then try again,
 * and again, and again...
 */
function waitForProjection(then) {
  proj = overlay.getProjection();
  if (proj) {
    return then();
  } 
  var tries = 0;
  function wait() {
    setTimeout(function() {
      proj = overlay.getProjection();
      if (proj) {
        then();
      } else {
        if (++tries > 100) {
          console.error("no projection after %d tries, giving up", tries);
        } else {
          console.warn("no projection yet, waiting again...");
          wait();
        }
      }
    }, 100);
  }
  wait();
}

/*
 * initialize the visualization
 */
function init() {

  // get the overlay div as a d3 selection,
  // and get its screen dimensions
  var root = d3.select("#overlay"),
      width = root.property("offsetWidth"),
      height = root.property("offsetHeight");
  // console.log("size:", [width, height]);

  var controls = root.append("form")
    .attr("id", "controls")
    .on("submit", function() {
        var input = zipInput.node();
        popZipCode(input.value);
        input.select();
        d3.event.preventDefault();
        return false;
    });
  var zipInput = controls.append("label")
    .text("Zip: ")
    .append("input")
      .attr("type", "text")
      .attr("size", 5);

  // create a map projection function and SVG path generator
  var project = (function(x) {
      return function(x) {
        var pt = proj.fromLatLngToContainerPixel(new gm.LatLng(x[1], x[0]));
        return [pt.x, pt.y];
      };
    })(),
    path = d3.geo.path()
      .projection(project);

  // create our SVG node
  var svg = root.append("svg")
    .attr("width", "100%")
    .attr("height", "100%");

  // defs for patterns and effects
  var defs = svg.append("defs");

  // our states layer
  var stateLayer = svg.append("g")
    .attr("class", "states");

  time.reset();

  // a <g> for each state
  var stateGroups = stateLayer.selectAll("g")
    .data(states).enter().append("g")
      .attr("id", function(d) {
          return d.id;
      });

  // and a <path> for each outline
  var stateShapes = stateGroups.append("path")
    .attr("class", "outline")
    .attr("id", function(d, i) {
      return "shape-" + d.id;
    })
    .attr("d", path)
    .attr("transform", function(d, i) {
      if (d.offset) {
        var centroid = path.centroid(d),
            center = project(centroid),
            scale = d.offset.scale || 1;
        return "translate(" + d.offset.translate + ") " +
               "scale(" + [scale, scale] + ") ";
      } else {
        return "";
      }
    });

  time.mark("states.render");

  // create a grid array and compute the centroid (in screen coordinates) for
  // each state
  states.forEach(function(state) {
    state.grid = [];
    state.center = path.centroid(state);
  });

  // create a grid of size `step` as a 2d array:
  // grid[y][x] = <reference to state object>
  var step = 14,
      xi = 0, yi = 0,
      grid = [];
  for (var y = step; y < height; y += step) {
    var row = grid[yi] = [],
        xi = 0;
    for (var x = step; x < width; x += step) {
      // hit test this point, then grab the node's data
      var el = document.elementFromPoint(x, y),
          state = el ? d3.select(el).datum() : null;
      // grid cells can be null
      row[xi] = state;
      if (state) {
        // add this grid cell to the state's grid array
        state.grid.push({
          state: state,
          pos: [x, y]
        });
      }
      xi++;
    }
    yi++;
  }

  time.mark("grid.compute");
  // console.log("grid:", grid);

  // hide all of the shapes
  // (NOTE: Alaska and Hawaii are kept visible in the stylesheet)
  stateShapes.style("visibility", "hidden");

  // for each state, create a <g> to contain cells
  var cellGroups = stateGroups.append("g")
    .attr("class", "cells");

  // and create a <g> for each cell within those
  var cells = cellGroups.selectAll("g")
    // each state gets cells for all its grid squares
    .data(function(state) {
      return state.grid;
    }).enter().append("g")
      .attr("class", "cell")
      .attr("transform", function(d, i) {
        return "translate(" + d.pos + ")";
      });

  // color scale: pledges -> fill
  var color = d3.scale.linear()
    .clamp(true)
    .domain([0, 10])
    .range(["#7eb0cc", "#0090c4"]);

  // and each cell gets a <rect> in its center
  var squares = cells.append("rect")
    .attr("class", "square")
    .attr("x", -step / 2)
    .attr("y", -step / 2)
    .attr("width", step)
    .attr("height", step)
    .attr("fill", color(0))
    .attr("stroke", "#fff")
    .attr("stroke-width", 1)
    .attr("stroke-opacity", 0)
    .attr("transform", "scale(0,0)");

  // pre-compute group and siblings for each cell
  squares.each(function(g, i) {
    // TODO: get pledge counts from a data file?
    g.pledges = 0;
    g.group = d3.select(this.parentNode.parentNode);
    g.siblings = g.group.selectAll(".cell");
  });

  time.mark("grid.draw");
  console.log("%d grid cells computed in %s, drawn in %s", (xi * yi), time.get("grid.compute"), time.get("grid.draw"));

  // clicking a square "pops" it
  squares.on("click", pop);

  // a single tooltip?
  var tooltip = root.append("div")
    .attr("id", "tooltip");
  tooltip.append("span")
    .attr("class", "text");

  // "pop" a cell rectangle and its siblings:
  // 1. sort its siblings by distance from itself
  // 2. scale them all up with a transition, then down again with another
  function pop(g, i) {
    time.reset();
    // maxi is the # of the state's grid squares minus 1
    var maxi = g.state.grid.length - 1,
        siblings = g.siblings
          .each(function(g2, j) {
            g2.cdist = distance(g.pos, g2.pos);
          })
          .sort(function(a, b) {
            return a.cdist - b.cdist;
          });

    this.parentNode.parentNode.appendChild(this.parentNode);
    d3.select(this)
      .attr("stroke-opacity", 1)
      .attr("fill", color(++g.pledges));

    siblings.transition()
      .duration(500)
      .ease("quad-out")
      .select("rect")
        .delay(function(d, i) {
          return i * 5;
        })
        .attr("transform", function(d, i) {
            return (i === 0)
              ? "scale(1.5,1.5)"
              : "scale(1.1,1.1)";
        })
        .transition()
          .duration(600)
          .delay(function(d, i) {
            return 500 + maxi * 5 + (maxi - i) * 3;
          })
          .ease("quad-in")
          .attr("transform", "scale(0,0)")
          .attr("stroke-opacity", 0);
  }

  // pop a zip by zip code ("94117")
  function popZipCode(code) {
    if (code in zipsByCode) {
      var zip = zipsByCode[code];
      return popZip(zip);
    } else {
      console.warn("no such zip:", code);
      return false;
    }
  }

  // pop a zip by object (zipsByCode["94117"])
  function popZip(zip) {
    // get its location, projected position and state
    var loc = [zip.lon, zip.lat],
        pos = zip.pos || (zip.pos = project(loc)),
        state = statesByCode[zip.state];

    // find the corresponding grid square
    var square = d3.select("#" + zip.state)
      // select all of this zip's state cells
      .selectAll(".cell")
        // compute distance from this zip code
        .each(function(g, i) {
          g.zdist = distance(g.pos, pos);
        })
        // sort by distance ascending
        .sort(function(a, b) {
          return a.zdist - b.zdist;
        })
        // grab the first (closest) one
        .filter(function(d, i) {
          return i === 0;
        })
        // and select its square
        .select(".square");

    // if ther is no square, tell us and bail
    if (square.empty()) {
      console.warn("no square for %s (%s) @", zip.zip, zip.state, pos, "state:", state);
      return false;
    }

    // call pop() on this square
    square.each(pop);
    // XXX: use the actual grid square position?
    pos = square.datum().pos;

    tooltip
      .style("left", pos[0] + "px")
      .style("top", pos[1] + "px")
      .select(".text")
        .html("<b>" + zip.zip + "</b><br>" + state.properties.name);

    tooltip.transition()
      .duration(250)
      .style("opacity", 1)
      .each("end", function() {
        d3.select(this).transition()
          .delay(500)
          .duration(500)
          .style("opacity", 0);
      });

    return true;
  }

  // pop a random zip every n millis
  setInterval(function() {
    var zip = rand(zips);
    popZip(zip);
  }, params.frequency || 1000);

  // export more stuff
  exports.popZipCode = popZipCode;
  exports.popZip = popZip;
}

// pythagorean distance
function distance(p1, p2) {
  var dx = p1[0] - p2[0],
      dy = p1[1] - p2[1];
  return Math.sqrt(dx * dx + dy * dy);
}

// pick a random element from an array
function rand(a) {
  return a[~~(Math.random() * a.length)];
}

// export some stuff
exports.map = map;
exports.data = {
  states: states,
  statesByCode: statesByCode,
  zips: zips,
  zipsByCode: zipsByCode
};
exports.overlay = overlay;

})(this);
