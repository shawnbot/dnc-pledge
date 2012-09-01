(function(exports) {

var urls = {
  "zips":     "data/zips/zips-min.csv",
  "states":   "data/states/all.json",
  "pledges":  "slimjim.php?url=" + encodeURI("http://s3.amazonaws.com/fe62801166d8f0c4814d395147eaf91e.boprod.net/commit.csv")
};

// colors, confetti ordinal scale
var colors = {
    "red":        "#E31D3F",
    "white":      "#ffffff",
    "darkBlue":   "#00446a",
    "lightBlue":  "#09BCEF",
    "state":      "#ccc",
    "stateHilite":"#eee",
    "gold":       "#c8aa43"
  },
  color = d3.scale.ordinal()
    .range([colors.red, colors.darkBlue, colors.white, colors.lightBlue]);

var icons = {
  "pin1": {
    "url": "http://www.google.com/intl/en_us/mapfiles/ms/icons/yellow-dot.png",
    "width": 32,
    "height": 32,
    "offset": [-16, -32]
  },
  "pin2": {
    "url": "images/pin_dark_blue.png",
    "width": 13,
    "height": 23,
    "offset": [-6.5, -23]
  }
};

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

var hide = {"visibility": "off"},
    mapStyles = [
      {
        "featureType": "road",
        "stylers": [hide]
      },
      /*
      {
        "featureType": "landscape",
        "stylers": [hide]
      },
      */
      {
        "featureType": "poi",
        "stylers": [hide]
      },
      {
        "featureType": "administrative",
        "elementType": "labels",
        "stylers": [hide]
      },
      {
        "featureType": "water",
        "elementType": "labels",
        "stylers": [hide]
      },
      {
        "featureType": "all",
        "elementType": "all",
        "stylers": [
          { "saturation": -100 },
          { "lightness": -60 },
          { "gamma": 1.5 }
        ]
      }
    ];

// map options
var options = {
  "center":           new gm.LatLng(39, -100),
  "zoom":             5,
  "mapTypeId":        gm.MapTypeId.ROADMAP,
  // no UI
  "disableDefaultUI": true,
  // no scroll wheel
  "scrollwheel":      false,
  // styled map API stuff
  "styles": mapStyles
};

var map = new gm.Map(document.getElementById("map"), options),
    states = [],
    statesByCode = {},
    zips = [],
    zipsByCode = {},
    pledges = [];

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
d3.csv(urls.zips, function(rows) {
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
  d3.json(urls.states, function(collection) {
    time.mark("states.load");

    states = collection.features;
    states.forEach(function(feature) {
      statesByCode[feature.id] = feature;
    });

    // repositioning info for Alaska and Hawaii
    statesByCode.AK.offset = {
      translate: [298, 960],
      scale: .3
    };
    statesByCode.HI.offset = {
      translate: [840, -70],
      scale: 1
    };
    statesByCode.PR.offset = {
      translate: [112, -95],
      scale: 1
    };

    statesByCode.AK.inset = true;
    statesByCode.HI.inset = true;

    time.mark("states.parse");

    // how long did this all take?
    console.log("%d zips loaded in %s (parsed in %s)", zips.length, time.get("zips.load"), time.get("zips.parse"));
    console.log("%d states loaded in %s (parsed in %s)", states.length, time.get("states.load"), time.get("states.parse"));

    // next, load the pledges
    d3.csv(urls.pledges, function(rows) {

      pledges = rows;
      console.log("pledges:", pledges);

      exports.data = {
        states: states,
        statesByCode: statesByCode,
        zips: zips,
        zipsByCode: zipsByCode,
        pledges: pledges
      };

      // wait for the projection, then init
      waitForProjection(init);

    });
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

  // inset rectangles
  var insetRects = [
    {
      "state": "AK",
      "x": 40,
      "y": 670,
      "width": 360,
      "height": 360
    },
    {
      "state": "HI",
      "x": 420,
      "y": 880,
      "width": 150,
      "height": 150
    },
    {
      "state": "PR",
      "x": 1792,
      "y": 940,
      "width": 90,
      "height": 90
    }
  ];

  var insets = svg.append("g")
    .attr("id", "insets")
    .selectAll("rect")
      .data(insetRects).enter().append("rect")
        .attr("class", "inset")
        .attr("rx", 5)
        .attr("ry", 5)
        .attr("x", function(r) { return r.x + "px"; })
        .attr("y", function(r) { return r.y + "px"; })
        .attr("width", function(r) { return r.width + "px"; })
        .attr("height", function(r) { return r.height + "px"; });

  // our states layer
  var shapesLayer = svg.append("g")
    .attr("class", "shapes");

  var pointsLayer = svg.append("g")
    .attr("class", "points");

  time.reset();

  var zipsByState = d3.nest()
    .key(function(z) { return z.state; })
    .map(zips);

  var zipPrecision = parseInt(params.zip_precision) || 4,
      gridSize = parseFloat(params.grid_size) || 15;

  // create a grid array and compute the centroid (in screen coordinates) for
  // each state
  states.forEach(function(state) {
    var stz = zipsByState[state.id];
    if (zipPrecision > 0) {
      state.grid = d3.nest()
        .key(function(z) { return z.zip.substr(0, zipPrecision); })
        .entries(stz)
        .map(function(entry) {
          var z = entry.values[0],
              pos = project([z.lon, z.lat]);
          if (state.offset) {
            pos[0] = pos[0] * state.offset.scale + state.offset.translate[0];
            pos[1] = pos[1] * state.offset.scale + state.offset.translate[1];
          }
          return {
            state: state,
            zip: z,
            pos: pos
          };
        });
    } else {
      state.grid = [];
    }

    // state.grid = [];
    state.center = path.centroid(state);
  });

  // sort states by center y
  states.sort(function(a, b) {
    return a.center[1] - b.center[1];
  });

  // a <g> for each state
  var shapeGroups = shapesLayer.selectAll("g")
    .data(states).enter().append("g")
      .attr("id", function(d) {
          return d.id;
      })
      .classed("inset", function(state) {
        return state.inset;
      });

  // and a <path> for each outline
  var stateShapes = shapeGroups.append("path")
    .attr("class", "outline")
    .attr("id", function(d, i) {
      return "shape-" + d.id;
    })
    .attr("d", path)
    .attr("fill", colors.state)
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

  // create a grid of size `step` as a 2d array:
  // grid[y][x] = <reference to state object>
  var radius = 12;
  if (gridSize > 0 && !zipPrecision) {
    var step = gridSize,
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

    radius = Math.round(gridSize / 1.8);
  }

  // assign "y" properties to each grid square and sort them
  states.forEach(function(state) {
    state.grid.forEach(function(g, i) {
      g.y = g.pos[1];
    });
    state.grid.sort(function(a, b) {
      return a.y - b.y;
    });
  });

  time.mark("grid.compute");
  // console.log("grid:", grid);

  // a <g> for each state
  var pointGroups = pointsLayer.selectAll("g")
    .data(states).enter().append("g")
      .attr("id", function(d) {
          return "points-" + d.id;
      })
      .classed("inset", function(state) {
        return state.inset;
      });

  // for each state, create a <g> to contain cells
  var cellGroups = pointGroups.append("g")
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

  var confetti = params.confetti != "0";

  // and each cell gets a <rect> in its center
  var squares = cells.append("circle")
    .attr("class", "square")
    .attr("r", radius)
    .attr("fill", confetti
        ? function(d, i) {
            return color(Math.random());
        } : colors.darkBlue)
    .attr("fill-opacity", .9)
    .attr("transform", "translate(0,0) scale(0,0)");

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
  pointGroups.on("click", function(state) {
    console.log("click:", d3.event, state);
    var e = d3.event,
        pos = d3.mouse(root.node());
    var result = popPoint(pos, state.id, "Click M.", state.properties.name);
    console.log("popPoint(", [pos, state.id], "):", result);
  });

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
    var siblings = g.siblings
      .each(function(g2, j) {
        g2.cdist = distance(g.pos, g2.pos);
      });

    var shape = d3.select("#shape-" + g.state.id)
      .transition()
        .duration(500)
        .ease("in")
        .attr("fill", colors.stateHilite)
        .transition()
          .delay(600)
          .duration(30000)
          .ease("out")
          .attr("fill", colors.state);

    var sd = siblings.data().sort(function(a, b) {
      return a.cdist - b.cdist;
    });
    var maxi = sd.length - 1,
        maxd = sd[maxi].cdist;

    g.pledges++;

    var icon = icons.pin2,
        ic = d3.select(this.parentNode)
          .selectAll(".icon")
          .data([g.pledges]);
    var img = ic.enter()
      .append("g")
        .attr("class", "icon")
        .attr("transform", "scale(0,0)")
        .append("image")
          .attr("xlink:href", icon.url)
          .attr("width", icon.width)
          .attr("height", icon.height)
          .attr("x", icon.offset[0])
          .attr("y", icon.offset[1]);
    ic.transition()
      .duration(400)
      .ease("quad-out")
      .attr("transform", "scale(1,1)");

    var speed = 400, // pixels per second
        initialDelay = 50,
        duration1 = initialDelay + 400,
        secondaryDelay = 100,
        duration2 = duration1 * 1.6 + secondaryDelay;

    siblings.transition()
      .duration(duration1)
      .ease("quad-out")
      .select(".square")
        .delay(function(d, i) {
          return initialDelay + (duration1 - initialDelay) * d.cdist / maxd;
        })
        .attr("transform", function(d, i) {
            var f = d.cdist / maxd,
              offy = -5 - 10 * (1 - f),
              scale = .2 + .4 * (1 - f);
            return [
              "translate(" + [0, offy] + ")",
              "scale(" + [scale, scale] + ")"
            ].join(" ");
        })
        .transition()
          .duration(duration2)
          .delay(function(d, i) {
            return duration1 + secondaryDelay + (duration2 - secondaryDelay) * d.cdist / maxd;
          })
          .ease("in")
          .attr("transform", "translate(0,0) scale(0,0)");
  }

  // pop a zip by zip code ("94117")
  function popZipCode(code, title, subtitle) {
    if (code in zipsByCode) {
      var zip = zipsByCode[code];
      return popZip(zip, title, subtitle);
    } else {
      console.warn("no such zip:", code);
      return false;
    }
  }

  function popPoint(pos, state, title, subtitle) {
    // find the corresponding grid square
    var cells = d3.select("#points-" + state)
      // select all of this zip's state cells
      .selectAll(".cell")
        // compute distance from this zip code
        .each(function(g, i) {
          g.zdist = distance(g.pos, pos);
        })
        // sort by distance ascending
        .sort(function(a, b) {
          return a.zdist - b.zdist;
        });

    // grab the first (closest) one
    var square = cells.filter(function(d, i) {
        return i === 0;
      })
      // and select its square
      .select(".square");

    cells.sort(function(a, b) {
      return a.y - b.y;
    });

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
        .html("<b>" + title + "</b><br>" + subtitle);

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

  // pop a zip by object (zipsByCode["94117"])
  function popZip(zip, title, subtitle) {
    // get its location, projected position and state
    var loc = [zip.lon, zip.lat],
        pos = zip.pos || (zip.pos = project(loc)),
        state = statesByCode[zip.state];

    // defaults
    title = title || zip.zip;
    subtitle = subtitle || state.properties.name;

    return popPoint(pos, zip.state, title, subtitle);
  }

  function startPledging() {
    var msPerLoad = 10 * 60000, // minutes * ms/minute
        msPerPledge = msPerLoad / pledges.length,
        list = pledges.slice(),
        timeout;

    list.sort(function(a, b) {
        return -1 + Math.random() * 2;
        // return d3.ascending(a.name, b.name);
    });

    function nextPledge() {
      if (list.length) {
        var pledge = list.shift(),
            zip = pledge.zip.substr(0, 5);
        popZipCode(zip, pledge.name, pledge.city);

        var t = msPerPledge * .5 + Math.random() * msPerPledge;
        timeout = setTimeout(nextPledge, t);
      } else {
        var url = urls.pledges + "?time=" + Date.now();
        d3.csv(url, function(rows) {
          pleges = data.pledges = rows;
          startPledging();
        });
      }
    }

    nextPledge();
  }

  startPledging();

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
exports.overlay = overlay;

})(this);
