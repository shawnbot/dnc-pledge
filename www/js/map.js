(function(exports) {

var options = {
  center: new google.maps.LatLng(40, -100),
  zoom: 3,
  mapTypeId: google.maps.MapTypeId.ROADMAP
};

var map = exports.map = new google.maps.Map(document.getElementById("map"), options);

// styled map API: 
var styles = [
  {
    stylers: [
      { saturation: -100 }
    ]
  },
  {
    featureType: "administrative.country",
    elementType: "geometry",
    stylers: [
      { hue: "#ff0000" },
      { saturation: 100 }
    ]
  },{
    featureType: "road",
    elementType: "labels",
    stylers: [
      { visibility: "off" }
    ]
  }
];

map.setOptions({styles: styles});


})(this);
