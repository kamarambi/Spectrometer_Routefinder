
var map;
var inDrawMode = false;
var loadFromDrawing = true;
var cleanPyCoords = function(c){
    //CEF sometimes converts coords to strings, make sure they're numbers
    return {lat:Number(c.lat),lng:Number(c.lon)};

};

var toPyCoords = function(latLng){
    //convert google.maps.LatLng back to dict for CEF
    return{
        'lat':latLng.lat(),
        'lon':latLng.lng()
    }
}

icon_url='http://maps.google.com/mapfiles/kml/shapes/placemark_circle.png';
//plus_url='http://maps.google.com/mapfiles/kml/paddle/grn-blank-lv.png';
plus_url='https://cdn.pixabay.com/photo/2014/04/02/10/55/plus-304947_960_720.png'
var userDrawnRegion = {
    drawnAreas: [],
    vertexMarkers: [],
    init:function(){
        //call this once map is initialized
        var self=this;
        this.vertexImage = new google.maps.MarkerImage(icon_url,
            new google.maps.Size(30,30),
            new google.maps.Point(0,0),
            new google.maps.Point(15,15)
        );
        this.centerPlus = new google.maps.Marker({
            icon: new google.maps.MarkerImage(plus_url,
                new google.maps.Size(30,30),
                new google.maps.Point(0,0),
                new google.maps.Point(15,15)
            )
        });
        this.centerPlus.addListener('dblclick',function(){
            self.closeVertices();
        });

    },
    findCenter: function(){
        if(this.vertexMarkers.length < 2) return;

        var center = {lat:0,lng:0};

        _.each(this.vertexMarkers,function(m){
            center.lat+=m.getPosition().lat();
            center.lng+=m.getPosition().lng();
        });
        center.lat/=this.vertexMarkers.length;
        center.lng/=this.vertexMarkers.length;
        this.centerPlus.setMap(map);
        this.centerPlus.setPosition(center);

    },
    addVertex: function(latLng){
        var self=this;
        var newMarker = new google.maps.Marker({
            position:latLng,
            map:map,
            draggable:true,
            icon:self.vertexImage
        });
        newMarker.addListener('dragend',function(){self.findCenter()});
        this.vertexMarkers.push(newMarker);
        this.findCenter();

    },
    closeVertices: function(){
        //convert coords objects into a list of {lat,lng} pairs so it can be
        //parsed by CEFPython
        var coords=_.map(this.vertexMarkers,(m)=>toPyCoords(m.getPosition()));
        //CefPython ensures the coords are in an order that forms a convex
        //polygon
        var self = this;
        external.polygonizePoints(coords,function(coords){
            coords = _.map(coords,(c)=>cleanPyCoords(c));
            var newPoly = new google.maps.Polygon({
                paths:coords,
                strokeColor:'#0000ff',
                strokeOpacity:0.8,
                strokeWeight:2,
                fillColor: '#0000ff',
                fillOpacity: 0.35,
                draggable: true,
                editable:true
            });
            newPoly.setMap(map);
            _.each(self.vertexMarkers,(m)=>m.setMap(null));
            self.vertexMarkers=[];
            self.centerPlus.setMap(null);
            self.drawnAreas.push(newPoly);
        });

    },
    getCoords: function(){
        var self = this;
        var coords = [];
        _.each(self.drawnAreas,function(area){
            var len = area.getPath().getLength();
            var inner_coords = [];
            _.each(_.range(len),(i)=>{
                inner_coords.push(toPyCoords(area.getPath().getAt(i)));
            });
            coords.push(inner_coords);
        });

        return coords;
    },

    clearDrawing:function(){
        var self = this;
        _.each(self.vertexMarkers,(m)=>m.setMap(null));
        self.vertexMarkers=[];
        _.each(self.drawnAreas,(a)=>a.setMap(null));
        self.drawnAreas=[];
        self.vertexMarkers=[];
        self.centerPlus.setMap(null);

    },
    enterDrawMode:function(){
        if(scanPath) scanPath.setMap(null);
        if(homeMarker) homeMarker.setMap(null);
        _.each(this.drawnAreas,function(area){
            area.setOptions({
                fillOpacity: 0.35,
                draggable: true,
                editable:true
            });
        });

    },
    exitDrawMode:function(){
        //this.closeVertices();
        _.each(this.drawnAreas,function(area){
            area.setOptions({
                fillOpacity: 0.05,
                draggable: false,
                editable:false
            });
        });

    },
    


};


var homeMarker;
var resetHome = true;
var setHomeMarker = function(latlng){
    if(homeMarker) homeMarker.setMap(null);
    homeMarker = new google.maps.Marker({
        position:latlng,
        map: map,
        draggable:true
            
    });
    homeMarker.setMap(map);
    homeMarker.addListener('dragend',function(event){
        external.setHome(event.latLng.lat(),event.latLng.lng());   
        resetHome = false;
        $('#generate').click()
    });

};
var scanPath;

var setScanPath = function(latlngs){
    if(scanPath) scanPath.setMap(null);
    scanPath = new google.maps.Polyline({
        path:latlngs,
        geodesic:true,
        strokeColor: '#FF0000',
        strokeOpacity:1.0,
        strokeWeight: 2
    });
    scanPath.setMap(map);

};

var setBoundBox = function(bounds){
    boundBox=new google.maps.LatLngBounds(bounds[0],bounds[1]);
    map.fitBounds(boundBox);
    map.setZoom(map.getZoom()-1);

}

function initMap() {
    var zerozero= {lat: 0, lng: 0};

    map = new google.maps.Map(document.getElementById('map'), {
      zoom: 3,
      center: zerozero,
      disableDoubleClickZoom: true,
      mapTypeId: 'satellite'
    });
    
    //if we're in draw mode, double clicking should add a vertex rather than
    //zooming in the map
    map.addListener('dblclick',function(event){
        if(inDrawMode){
            console.log(event.latLng.lat(),event.latLng.lng());
            userDrawnRegion.addVertex(event.latLng);
        } else {
            console.log("not in draw mode!");
        } 
    });

    userDrawnRegion.init();
};
$(document).ready(function(){
    $('#infile').click(function(){
        external.loadFile(function(file){
            loadFromDrawing=false;
            $('#infile').html(file);
            $('#generate').click();
        });
    });

    //bind functions to buttons
    $('#generate').click(function(){
        if(!($('#alt').val()&&$('#bearing').val()))return;
        if(!loadFromDrawing && $('#infile').html() == 'Choose File') return;
        var coords = (loadFromDrawing)?userDrawnRegion.getCoords():false;
        console.log(coords);
        external.createPath(coords,function(coords,bounds){
            coords = _.map(coords,(c)=>cleanPyCoords(c));
            bounds = _.map(bounds,(c)=>cleanPyCoords(c));

            setScanPath(coords);
            if(resetHome){
                setHomeMarker(coords[0]);
                if(!loadFromDrawing){
                    setBoundBox(bounds);
                }
            }
            resetHome=true;
        
        });
    });
    $('#clear_draw').click(function(){
        userDrawnRegion.clearDrawing();
    });    
    $('#start_draw').click(function(){
        inDrawMode = true;
        loadFromDrawing = true;
        $('#draw_panel').show();
        userDrawnRegion.enterDrawMode();
    });
    $('#finish_draw').click(function(){
        inDrawMode = false;
        $('#draw_panel').hide();
        userDrawnRegion.exitDrawMode();
        $('#generate').click();
    });

    $('#alt').change(function(){
        external.setAlt($(this).val());
        $('#generate').click();
    });
    $('#bearing').change(function(){
        external.setBearing($(this).val());
        $('#generate').click();
    });
    $('#save').click(function(){
        external.savePath();
    });



});
