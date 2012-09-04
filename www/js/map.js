(function(exports) {

// parse query string params
var params = (function(str) {
  if (str.length > 1) {
    if (str.charAt(0) === "?") str = str.substr(1);
    var query = {},
        parts = str.split("&"),
        len = parts.length;
    for (var i = 0; i < len; i++) {
      var part = parts[i].split("="),
          key = part[0],
          val = parts.length > 1
            ? decodeURIComponent(part[1])
            : true,
          num = parseInt(val);
      query[key] = !isNaN(num) ? num : val;
    }
    return query;
  } else {
    return {};
  }
})(location.search);

// console.log("params:", JSON.stringify(params));

var urls = {
  "zips":     "data/zips/zipcodes.csv",
  "states":   "data/states/all.json"
};

function getCommitURL(uri) {
  return "slimjim.php?url=" + encodeURI("http://s3.amazonaws.com/fe62801166d8f0c4814d395147eaf91e.boprod.net/" + uri);
}

// colors, confetti ordinal scale
var colors = {
    "red":        "#E31D3F",
    "white":      "#ffffff",
    "darkBlue":   "#00446a",
    "lightBlue":  "#09BCEF",
    "stateOff":   "#cfd4d9",
    "stateOn":    "#08aaf9",
    "gold":       "#c8aa43"
  },
  color = d3.scale.ordinal()
    .range([colors.red, colors.darkBlue, colors.white, colors.lightBlue]);

var tooltipExpiry = 5000;

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
  },
  "dnc": {
    "url": "images/dnc-pin06-outline.png",
    "width": 40,
    "height": 64,
    "offset": [-20, -62]
  }
};

// for brevity!
var gm = google.maps;

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

// from Geraldine's comp
mapStyles = [
  {
    "stylers": [
      { "color": "#052642" }
    ]
  },{
    "stylers": [
      { "visibility": "off" }
    ]
  },{
    "featureType": "landscape",
    "elementType": "geometry",
    "stylers": [
      { "visibility": "on" }
    ]
  },{
    "featureType": "water",
    "elementType": "geometry",
    "stylers": [
      { "visibility": "on" },
      { "color": "#03162c" }
    ]
  }
];

// map options
var options = {
  "center":           new gm.LatLng(39.5, -95),
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

var stuff = d3.select("#map, #overlay")
  .style("opacity", 0);

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

    states = collection.features.filter(function(feature) {
      return feature.id !== "PR";
    });

    states.forEach(function(feature) {
      statesByCode[feature.id] = feature;
    });

    time.mark("states.parse");

    // how long did this all take?
    console.log("%d zips loaded in %s (parsed in %s)", zips.length, time.get("zips.load"), time.get("zips.parse"));
    console.log("%d states loaded in %s (parsed in %s)", states.length, time.get("states.load"), time.get("states.parse"));

    if (params.fake > 0) {

      pledges = makeFakePledges(params.fake);
      console.log("created", pledges.length, "fake pledges");
      doneLoading();

    } else {

      var pledgeURL = getCommitURL("commit2vote-10min.csv");
      // next, load the pledges
      d3.csv(pledgeURL, function(rows) {

        pledges = rows;
        console.log("loaded", pledges.length, "pledges");

        if (pledges.length > 100) {
          console.log("all good; proceeding");

          doneLoading();

        } else {
          console.warn("falling back on 24-hour feed");

          var pledgeURL = getCommitURL("commit2vote-24hour.csv");
          d3.csv(pledgeURL, function(rows) {
            pledges = rows;
            doneLoading();
          });
        }
      });
    }

  });
});

function doneLoading() {
  exports.data = {
    states: states,
    statesByCode: statesByCode,
    zips: zips,
    zipsByCode: zipsByCode,
    pledges: pledges
  };

  // wait for the projection, then init
  waitForProjection(init);
}

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

  stuff.call(fadeIn);

  // get the overlay div as a d3 selection,
  // and get its screen dimensions
  var root = d3.select("#overlay"),
      mapr = d3.select("#map"),
      offset = [
        mapr.property("offsetLeft"),
        mapr.property("offsetTop")
      ],
      width = mapr.property("offsetWidth"),
      height = mapr.property("offsetHeight"),
      center = [width / 2, height / 2];
  // console.log("size:", [width, height]);

  // allow map tiles to bleed
  var makeVisible = d3.selectAll("#map, #map div")
    .style("overflow", "visible");

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
    .attr("width", width)
    .attr("height", height);

  // defs for patterns and effects
  var defs = svg.append("defs");

  // repositioning info for Alaska and Hawaii
  statesByCode.AK.offset = {
    translate: [266, 920],
    scale: .22
  };
  statesByCode.HI.offset = {
    translate: [1038, -106],
    scale: 1
  };
  /*
  statesByCode.PR.offset = {
    translate: [0, -142],
    scale: 1
  };
  */

  statesByCode.AK.inset = true;
  statesByCode.HI.inset = true;
  // statesByCode.PR.inset = true;

  // inset rectangles
  var insetRects = [
    {
      "state": "AK",
      "x": 2,
      "y": 790,
      "width": 280,
      "height": 250
    },
    {
      "state": "HI",
      "x": 312,
      "y": 910,
      "width": 150,
      "height": 130
    } /*,
    {
      "state": "PR",
      "x": 1374,
      "y": 950,
      "width": 90,
      "height": 90
    } */
    // TODO: Guam? (needs data)
  ];

  var insetOffset = [0, 37];

  var insets = svg.append("g")
    .attr("id", "insets")
    .attr("transform", "translate(" + insetOffset + ")")
    .selectAll("rect")
      .data(insetRects).enter().append("rect")
        .attr("id", function(r) { return "inset-" + r.state; })
        .attr("class", "inset")
        .attr("rx", 5)
        .attr("ry", 5)
        .attr("x", function(r) { return r.x; })
        .attr("y", function(r) { return r.y - 80; })
        .attr("width", function(r) { return r.width; })
        .attr("height", function(r) { return r.height; });

  // our states layer
  var shapesLayer = svg.append("g")
    .attr("class", "shapes")
    .attr("opacity", 0);

  shapesLayer.call(fadeIn);

  time.reset();

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
    .attr("fill", colors.stateOff)
    .attr("transform", function(d, i) {
      if (d.offset) {
        var scale = d.offset.scale || 1;
        d.centroid = path.centroid(d);
        d.offset.translate[0] += insetOffset[0];
        d.offset.translate[1] += insetOffset[1];
        return "translate(" + d.offset.translate + ") " +
               "scale(" + [scale, scale] + ") ";
      } else {
        return "";
      }
    });

  // hide Puerto Rico
  d3.select("#PR").style("display", "none");

  time.mark("states.render");

  zips.forEach(function(z) {
    var pos = project([z.lon, z.lat]),
        state = statesByCode[z.state];
    if (state && state.offset) {
        var off = state.offset;
        pos[0] = pos[0] * off.scale + off.translate[0];
        pos[1] = pos[1] * off.scale + off.translate[1];
    }
    z.pos = pos;
    z.y = pos[1];
    z.pledges = 0;
  });

  zips.sort(function(a, b) {
    return a.y - b.y;
  });

  time.mark("zips.project");
  console.log("projected zips in %s", time.get("zips.project"));

  var zipsByState = d3.nest()
    .key(function(z) { return z.state; })
    .map(zips);

  var zipsByPrefix = d3.nest()
    .key(function(z) { return z.zip.substr(0, 4); })
    .map(zips);

  var pointsLayer = svg.append("g")
    .attr("class", "points");

  var zipGroups = pointsLayer.selectAll(".zip")
    .data(zips).enter().append("g")
    .attr("id", function(z, i) {
      return "zip-" + z.zip;
    })
    .attr("class", function(z, i) {
      return "zip state-" + z.state;
    })
    .attr("transform", function(z, i) {
      return "translate(" + z.pos + ")";
    });

  time.mark("zips.draw");
  console.log("drew zips in %s", time.get("zips.draw"));

  var confetti = params.confetti != "0";

  // clicking a square "pops" it
  stateShapes.on("click", function(state) {
    var e = d3.event,
        pos = d3.mouse(root.node()),
        stateZips = zipsByState[state.id];
    console.log("click:", pos.join(","), state.id);
    var closest = getClosestZip(pos, stateZips);
    if (closest) {
      closest.rainy = true;
      popZip(closest, "Shawn A.");
    } else {
      console.warn("couldn't find closest zip among:", stateZips);
    }
  });

  function getClosestZip(pos, listOfZips) {
    listOfZips.forEach(function(z, i) {
      z.pdist = distance(pos, z.pos);
    });
    listOfZips.sort(function(a, b) {
      return a.pdist - b.pdist;
    });
    return listOfZips[0];
  }

  // a single tooltip?
  var tooltip = root.append("div")
    .attr("id", "tooltip");
  var ttext = tooltip.append("span")
    .attr("class", "text");
  var titletext = ttext.append("span")
    .attr("class", "title");
  var subtext = ttext.append("span")
    .attr("class", "subtitle");

  function flashState(id) {
    return d3.select("#shape-" + id)
      .transition()
        .duration(300)
        .ease("in")
        .attr("fill", colors.stateOn)
        .transition()
          .delay(300)
          .duration(2000)
          .ease("out")
          .attr("fill", colors.stateOff);
  }

  var ico = icons.dnc;
  function popIcon(zip) {
    var g = d3.select(this),
        icon = g.selectAll(".icon")
          .data([zip]);

    icon.enter().append("g")
      .attr("class", "icon confetti")
      .attr("transform", "scale(0,0)")
      .append("image")
        .attr("xlink:href", ico.url)
        .attr("width", ico.width)
        .attr("height", ico.height)
        .attr("x", ico.offset[0])
        .attr("y", ico.offset[1]);

    icon.transition()
      .duration(200)
      .ease("in")
      .attr("transform", "scale(1.5,1.5)")
      .transition()
        .delay(205)
        .duration(100)
        .attr("transform", "scale(1,1)")
  }

  // "pop" a zip <g>
  function pop(zip) {
    var g = d3.select(this);
    popIcon.call(this, zip);

    if (zip.rainy) {
      var numChads = randn(80, 100),
          maxR = randn(80, 160);
      makeItRain(g, numChads, maxR);
    }
  }

  function getZipByCode(code) {
    var zip5 = code.substr(0, 5);
    if (code in zipsByCode) {
      return zipsByCode[code];
    } else if (zip5 in zipsByCode) {
      console.log("long zip truncated:", code, "->", zip5);
      return zipsByCode[zip5];
    } else {
      var prefix = code.substr(0, 4);
      if (prefix in zipsByPrefix) {
        var first = zipsByPrefix[prefix][0],
            approx = {
              zip: code,
              lat: first.lat,
              lon: first.lon,
              pos: first.pos,
              state: first.state
            };
        console.warn("approximated zip:", code, approx);
        zipsByCode[code] = approx;
        return approx;
      }
      console.warn("no such zip:", code);
      return null;
    }
  }

  // pop a zip by zip code ("94117")
  function popZipCode(code, title, subtitle) {
    var zip = getZipByCode(code);
    if (zip) {
      return popZip(zip, title, subtitle);
    } else {
      return false;
    }
  }

  // pop a zip by object (zipsByCode["94117"])
  function popZip(zip, title, subtitle) {
    // get its location, projected position and state
    var loc = [zip.lon, zip.lat],
        pos = zip.pos,
        state = statesByCode[zip.state];

    // defaults
    title = title || zip.zip;
    if (zip.city) {
      subtitle = subtitle || [zip.city, zip.state].join(", ");
    } else {
      if (state) {
        subtitle = subtitle || state.properties.name;
      } else {
        subtitle = subtitle || state;
      }
    }

    if (state) {
      flashState(state.id);
    } else {
      console.log("no such state:", zip.state);
    }
    showTooltip(pos, title, subtitle);

    return getZipGroup(zip).each(pop);
  }

  function getZipGroup(zip) {
    return d3.select("#zip-" + zip.zip);
  }

  function showTooltip(pos, title, subtitle, fadeDelay) {
    tooltip
      .style("left", pos[0] + "px")
      .style("top", pos[1] + "px");

    var text = ttext
      .style("position", "absolute");

    titletext.text(title);
    subtext.text(subtitle);

    var dx = Math.round(pos[0] - center[0]),
        dy = Math.round(pos[1] - center[1]),
        tw = text.property("offsetWidth"),
        th = text.property("offsetHeight");
        margin = 40;
    // if (angle < 0) angle += 180;

    var arrow = "";
    if (Math.abs(dx) > Math.abs(dy)) { // horizontal
      if (dx > 0) {
        arrow = "right";
        text.style("bottom", "auto")
          .style("right", margin + "px")
          .style("left", "auto")
          .style("top", -th / 2 + "px");
      } else {
        arrow = "left";
        text.style("bottom", "auto")
          .style("right", "auto")
          .style("left", margin + "px")
          .style("top", -th / 2 + "px");
      }
    } else { // vertical
      if (dy > 0) {
        arrow = "bottom";
        text.style("bottom", (margin + 40) + "px")
          .style("right", "auto")
          .style("left", -tw / 2 + "px")
          .style("top", "auto");
      } else { // top
        arrow = "top";
        text.style("bottom", "auto")
          .style("right", "auto")
          .style("left", -tw / 2 + "px")
          .style("top", (margin - 10) + "px");
      }
    }

    ["top", "left", "bottom", "right"].forEach(function(dir) {
      ttext.classed("arrow-" + dir, (dir === arrow));
    });

    var ind = 200;
    return tooltip.transition()
      .duration(ind)
      // transitioning to 1 causes rendering flickers
      .style("opacity", .999) 
      .transition()
        .delay(ind + tooltipExpiry)
        .duration(500)
        .style("opacity", 0);
  }

  var hasShownUniques = false,
      iconPopTimeout,
      nextPledgeTimeout,
      nextPledge = function() {
        console.warn("nextPledge() called with no pledges");
      },
      popNextIcon = function() {
        console.warn("popNextIcon() called with no pledges");
      };

  function startPledging() {
    // msPerPledge is the time between showing labels for each
    // pledge (in milliseconds)
    var msPerPledge = 3500;
    if (params.spp) {
      msPerPledge = 1000 * params.spp;
    } else if (params.mspp) {
      msPerPledge = params.mspp;
    } else {
    }

    var loadDelay = pledges.length * msPerPledge;
    if (loadDelay < 60000) {
      msPerPledge = 60000 / pledges.length;
    }

    var list = pledges.slice()
      .sort(function(a, b) {
        return -1 + Math.random() * 2;
      });

    tooltipExpiry = Math.max(100, msPerPledge - 600);

    var delay = 500;
    if (!hasShownUniques) {
      var uniqueZips = d3.nest()
        .key(function(pledge) { return pledge.zip; })
        .rollup(function(a) { return a[0]; })
        .entries(list)
        .map(function(entry) { return entry.values; })
        .sort(function(a, b) {
          return -1 + Math.random() * 2;
        });

      // console.log(uniqueZips.length, "unique zip code pledges...", uniqueZips[0]);

      var popsPerTick = params.ppt || 2;
      uniqueZips.forEach(function(pledge, i) {
        // console.log("pledge:", pledge.zip);
        var zip = getZipByCode(pledge.zip);
        if (zip) {
          var g = getZipGroup(zip);
          if (i % popsPerTick === 0) {
            delay += 10;
          }
          setTimeout(function() {
            g.each(pop);
            // flashState(zip.state);
          }, delay);
        }
      });

      hasShownUniques = true;
      delay += 500;
    }

    var msPerIcon = 200;
    popNextIcon = function() {
      if (pledges.length === 0) return;

      var pledge = rand(pledges),
          zip = getZipByCode(pledge.zip);
      if (zip) {
        var wasRainy = zip.rainy;
        zip.rainy = false;
        d3.select("#zip-" + zip.zip).each(pop);
        zip.rainy = wasRainy;
      }

      iconPopTimeout = setTimeout(popNextIcon, randn(msPerIcon / 2, msPerIcon));
    };

    iconPopTimeout = setTimeout(popNextIcon, msPerIcon);

    nextPledge = function() {
      if (list.length) {
        var pledge = list.shift(),
            code = pledge.zip.substr(0, 5),
            zip = zipsByCode[code];
        if (zip) {
          zip.pledges++;
          zip.rainy = true;
          popZip(zip, pledge.name, pledge.city);
        } else {
          popZipCode(code, pledge.name, pledge.city);
        }

        nextPledgeTimeout = setTimeout(nextPledge, msPerPledge);
      } else {
        var url = getCommitURL("commit2vote-1min.csv");
        d3.csv(url, function(rows) {
          if (rows.length > 0) {
            pleges = data.pledges = rows;
          } else {
            console.warn("no pledges in 1-minute feed; reusing old pledges");
          }
          startPledging();
        });
      }
    };

    nextPledgeTimeout = setTimeout(nextPledge, delay);
  }

  var blurred = false;
  window.addEventListener("blur", function() {
      // if (blurred) return;

      console.log("* blurred @", Date.now());
      blurred = true;

      d3.selectAll("circle.confetti")
        .call(stopTransitions)
        .remove();

      tooltip
        .style("opacity", 0)
        .call(stopTransitions);

      d3.selectAll("g.icon")
        .attr("transform", "scale(1,1)")
        .call(stopTransitions);

      stateShapes
        .call(stopTransitions)
        .attr("fill", colors.stateOff);

      clearTimeout(iconPopTimeout);
      clearTimeout(nextPledgeTimeout);
  });

  window.addEventListener("focus", function() {
      // if (!blurred) return;

      console.log("* focused @", Date.now());
      blurred = false;
      nextPledge();
      popNextIcon();
  });

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

function randn(min, max) {
  return min + ~~((max - min) * Math.random());
}

function makeItRain(container, numChads, maxR) {
  var maxY = maxR / 3;

  var tr = d3.scale.linear()
    .domain([-maxY, maxY])
    .range([1, 4]);
  var offy = d3.scale.linear()
    .domain([0, Math.PI / 2, Math.PI, Math.PI * 3/2, Math.PI * 2])
    .range([0, 1, 1, .8, 1]);

  var chads = d3.range(0, numChads).map(function(i) {
    var r = randn(maxR / 3, maxR),
        theta = Math.PI * 2 * Math.random(),
        x = Math.cos(theta) * r,
        y = Math.sin(theta) * r / 3 * offy(theta),
        dist = Math.sqrt(x * x + x * x + y * y + y * y);
    return {
      radius: tr(y) + Math.random(),
      dist: dist,
      x: x,
      y: y
    };
  });

  var tx = d3.scale.linear()
    .domain([0, .25, .75, 1])
    .range([0, .75, 1, 1]);
  var ty = d3.scale.linear()
    .domain([0, .25, 1])
    .range([0, -1, 0]);

  var klass = "k" + Date.now();
  var bits = container.selectAll("." + klass)
    .data(chads).enter().append("circle")
    .attr("class", "confetti " + klass)
    .attr("fill", function(d, i) {
      return color(i);
    })
    .attr("r", 0);

  // sort everything by y
  container.selectAll(".confetti")
    .sort(function(a, b) {
      return a.y - b.y;
    });

  return bits
    .transition()
      .ease("linear")
      .delay(function(d, i) {
        return d.delay = Math.random() * 200;
      })
      .duration(function(d, i) {
        return d.duration = 400 + Math.random() * 400;
      })
      .attrTween("cx", function(d, i, x) {
        var lerp = d3.interpolate(x, d.x);
        return function(t) {
          return lerp(tx(t));
        };
      })
      .attrTween("cy", function(d, i, y) {
        var h = maxR + maxR * Math.max(0, (1 - d.dist / maxR)),
            lerp = d3.interpolate(y, d.y);
        return function(t) {
          var dy = h * ty(t);
          return lerp(t) + dy;
        };
      })
      .attr("r", function(d, i) { return d.radius; })
      .transition()
        .delay(function(d, i) {
          return d.delay + d.duration + 1000;
        })
        .duration(1000)
        .attr("r", 0)
        .each("end", function() {
          this.parentNode.removeChild(this);
        });
}

function fadeIn() {
  this.transition()
    .delay(1000)
    .duration(2000)
    .style("opacity", 1);
}

function stopTransitions() {
  this.transition()
    .duration(0);
}

function makeFakePledges(size) {
  var names = [
    "Shawn A.",
    "Daniel R.",
    "Andrew B.",
    "Jesse F.",
    "Eric R.",
    "Eric H.",
    "Geraldine S.",
    "Jenny K.",
    "Mark M.",
    "Andrea N.",
    "Michal M.",
    "Julie B.",
    "Rachel B.",
    "George O.",
    "Bill C.",
    "Zach W.",
    "Jeff E.",
    "Jesse T.",
    "Leslie B."
  ];
  return d3.range(0, size).map(function() {
      var zip = rand(zips);
      return {
        name: rand(names),
        zip: zip.zip,
        city: [zip.city, zip.state].join(", ")
      };
  });
}

// export some stuff
exports.map = map;
exports.overlay = overlay;

})(this);
