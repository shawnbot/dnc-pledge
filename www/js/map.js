(function(exports) {

var gm = google.maps;

var hide = {"visibility": "off"},
    options = {
      "center":           new gm.LatLng(36, -101),
      "zoom":             5,
      "mapTypeId":        gm.MapTypeId.ROADMAP,
      "disableDefaultUI": true,
      "scrollwheel":      false,
      // styled map API: 
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

var overlay = new gm.OverlayView();
overlay.draw = function() {};
overlay.setMap(map);

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

d3.csv("data/zips/zips.csv", function(rows) {
  time.mark("zips.load");

  zips = rows;
  zips.forEach(function(row) {
    zipsByCode[row.zip] = row;
  });

  time.mark("zips.parse");

  d3.json("data/states/all.json", function(collection) {
    time.mark("states.load");

    states = collection.features;
    states.forEach(function(feature) {
      statesByCode[feature.id] = feature;
    });

    statesByCode.AK.offset = {
      translate: [300, 780],
      scale: .3
    };
    statesByCode.HI.offset = {
      translate: [750, -150],
      scale: 1
    };

    time.mark("states.parse");

    init();
  });
});

function init() {
  console.log("loaded %d zips in %s (parsed in %s)", zips.length, time.get("zips.load"), time.get("zips.parse"));
  console.log("loaded %d states in %s (parsed in %s)", states.length, time.get("states.load"), time.get("states.parse"));

  var root = d3.select("#overlay"),
      width = root.property("offsetWidth"),
      height = root.property("offsetHeight");

  console.log("size:", [width, height]);
  var project = (function(x) {
      var proj = overlay.getProjection();
      return function(x) {
        var pt = proj.fromLatLngToContainerPixel(new gm.LatLng(x[1], x[0]));
        return [pt.x, pt.y];
      };
    })(),
    path = d3.geo.path()
      .projection(project);

  var svg = root.append("svg")
    .attr("width", "100%")
    .attr("height", "100%");

  var stateLayer = svg.append("g")
    .attr("class", "states");

  time.reset();

  var stateShapes = stateLayer.selectAll("path")
    .data(states).enter().append("path")
      .attr("id", function(d, i) {
        return d.id;
      })
      .attr("fill", "#000")
      .attr("fill-opacity", .2)
      .attr("stroke", "#f00")
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

  states.forEach(function(state) {
    state.grid = [];
    state.center = path.centroid(state);
  });

  var bounds = map.getBounds(),
      ne = bounds.getNorthEast(),
      sw = bounds.getSouthWest(),
      north = ne.lat(),
      south = sw.lat(),
      east = ne.lng(),
      west = sw.lng(),
      step = .5,
      grid = [];
  console.log("bounds:", bounds, [north, west, south, east]);
  for (var lat = south; lat <= north; lat += step) {
    var y = grid.length,
        row = grid[y] = [],
        x = 0;
    for (var lon = west; lon <= east; lon += step) {
      var c = [lon, lat],
          p = project(c),
          el = document.elementFromPoint(p[0], p[1]),
          d = el ? d3.select(el).datum() : null;
      // console.log([lon, lat], "->", p);
      row[x] = d;
      if (d) {
        d.grid.push({
          x: x,
          y: y,
          state: d,
          center: c,
          pos: p
        });
      }
      x++;
    }
  }

  console.log("grid:", grid);

  time.mark("grid.test");

  stateLayer.style("display", "none");

  var grid = svg.append("g")
    .attr("class", "grid");

  var stateGroups = grid.selectAll("g")
    .data(states).enter().append("g")
      .attr("class", "state")
      .attr("id", function(d) { return "grid-" + d.id; })
      .on("mouseover", function(d, i) {
          this.parentNode.appendChild(this);
      });

  var cells = stateGroups.selectAll("g")
    .data(function(state) {
      return state.grid.map(function(g) {
        g.dist = distance(state.center, g.pos);
        return g;
      });
    }).enter().append("g")
      .sort(function(a, b) {
        return b.dist - a.dist;
      })
      .attr("transform", function(g, i) {
        var scale = .4 + .6 * i / (g.state.grid.length - 1);
        return "translate(" + g.pos + ") scale(" + [scale, scale] + ")";
      });

  var sw = 16, sh = 18;
  var squares = cells.append("rect")
    .attr("x", -sw / 2)
    .attr("y", -sh / 2)
    .attr("width", sw)
    .attr("height", sh)
    .attr("fill", "#fff");

  time.mark("grid.draw");

  console.log("grid took %s to test, %s to draw", time.get("grid.test"), time.get("grid.draw"));
}

function distance(p1, p2) {
  var dx = p1[0] - p2[0],
      dy = p1[1] - p2[1];
  return Math.sqrt(dx * dx + dy * dy);
}

exports.map = map;
exports.states = states;
exports.statesByCode = statesByCode;
exports.zips = zips;
exports.zipsByCode = zipsByCode;
exports.overlay = overlay;

})(this);
