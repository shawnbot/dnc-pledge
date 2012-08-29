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
      translate: [820, -80],
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

  var stateGroups = stateLayer.selectAll("g")
    .data(states).enter().append("g")
      .attr("id", function(d) {
          return d.id;
      });

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

  states.forEach(function(state) {
    state.grid = [];
    state.center = path.centroid(state);
  });

  var step = 16,
      xi = 0, yi = 0,
      grid = [];
  for (var y = step; y < height; y += step) {
    var row = grid[yi] = [],
        xi = 0;
    for (var x = step; x < width; x += step) {
      var el = document.elementFromPoint(x, y),
          d = el ? d3.select(el).datum() : null;
      row[xi] = d;
      if (d) {
        d.grid.push({
          state: d,
          pos: [x, y]
        });
      }
      xi++;
    }
    yi++;
  }

  console.log("grid:", grid);
  stateShapes.style("visibility", "hidden");

  time.mark("grid.test");

  var cells = stateGroups.selectAll("g")
    .data(function(state) {
      return state.grid.map(function(g) {
        g.dist = distance(state.center, g.pos);
        return g;
      });
    }).enter().append("g")
      .attr("class", "cell")
      .sort(function(a, b) {
        return b.dist - a.dist;
      })
      .attr("transform", function(d, i) {
        return "translate(" + d.pos + ")";
      });

  var squares = cells.append("rect")
    .attr("class", "square")
    .attr("x", -step / 2)
    .attr("y", -step / 2)
    .attr("width", step)
    .attr("height", step)
    .attr("fill", "#33f")
    .attr("fill-opacity", .9)
    .attr("transform", "scale(0,0)");

  squares.on("click", pop);

  function pop(g, i) {
    var cell = d3.select(this),
        group = d3.select(this.parentNode.parentNode),
        len = g.state.grid.length - 1,
        siblings = group.selectAll(".cell")
          .each(function(g2) {
            g2.cdist = distance(g.pos, g2.pos);
          })
          .sort(function(a, b) {
            return a.cdist - b.cdist;
          });

    siblings.transition()
      .duration(500)
      .ease("quad-out")
      .select("rect")
        .delay(function(d, i) {
          return i * 5;
        })
        .attr("transform", "scale(1.2,1.2)")
        .transition()
          .duration(600)
          .delay(function(d, i) {
            return 800 + i * 5;
          })
          .ease("quad-in")
          .attr("transform", "scale(0,0)");
  }

  setInterval(function() {
    var g = rand(squares),
        s = rand(g);
    d3.select(s).each(pop);
  }, 250);

  time.mark("grid.draw");

  console.log("grid took %s to test, %s to draw", time.get("grid.test"), time.get("grid.draw"));
}

function distance(p1, p2) {
  var dx = p1[0] - p2[0],
      dy = p1[1] - p2[1];
  return Math.sqrt(dx * dx + dy * dy);
}

function rand(a) {
  return a[~~(Math.random() * a.length)];
}

exports.map = map;
exports.states = states;
exports.statesByCode = statesByCode;
exports.zips = zips;
exports.zipsByCode = zipsByCode;
exports.overlay = overlay;

})(this);
