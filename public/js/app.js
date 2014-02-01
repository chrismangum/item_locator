
var app = angular.module('app', []);

app.controller('mainCtrl', ['$scope', 'locationService',
  function ($scope, locationService) {
    //variables accessable to all child directives
    $scope.data = null;

    $scope.groupedData = {};
    $scope.groupKeys = null;
    $scope.groupLabel = '+ Miles';

    $scope.activeItem = null;

    $scope.map = new google.maps.Map(document.getElementById('map-canvas'), {
      zoom: 5,
      center: new google.maps.LatLng(39.8282, -98.5795),
    });

    $scope.deactivateItem = function () {
      $scope.activeItem = null;
    };
    $scope.activateItem = function (i) {
      $scope.activeItem = $scope.data[i];
    };

    locationService.init(function (data) {
      $scope.data = data;
      $scope.groupedData = data;
      $scope.$apply();
    });
  }
]);

app.directive('map', function () {
  return {
    restrict: 'E',
    template: '<div class="map-wrapper">' +
      '<div class="map" id="map-canvas"></div>' +
    '</div>',
    link: function(scope, el) {
      var pinClick,
        markers = [],
        infoWindow = new google.maps.InfoWindow();

      google.maps.event.addListener(infoWindow, 'closeclick', function () {
        scope.deactivateItem();
        scope.$apply();
      });

      function fitMapBounds() {
        var bounds = new google.maps.LatLngBounds();  
        _.each(markers, function (marker) {
          bounds.extend(marker.position);
        });
        scope.map.fitBounds(bounds);
      }

      function genInfoHtml(loc) {
        var html = [
          '<div class="info-window">', 
          '<div class="basic-info">',
          '<div class="info-name">'
        ];
        if (loc.website !== '-') {
          if (loc.website.indexOf('http://') === -1) {
            loc.website = 'http://' + loc.website;
          }
          html.push('<a target="_blank" href="', loc.website, '">', loc.name,'</a>');
        } else {
          html.push(loc.name);
        }
        html.push('</div><div class="info-address1">', loc.address,'</div>',
            '<div class="info-address2">', loc.city, ', ', loc.state, ' ', loc.zip, '</div>',
          '</div>',
          '<div class="row-fluid more-info">',
            '<div class="span6">',
              '<div class="filter-info-wrapper">',
                '<div class="label">Phone</div>',
                '<div class="filter-info">', loc.phone, '</div>',
              '</div>',
            '</div>',
          '</div>',
        '</div>');
        return html.join('');
      }

      function plotShops() {
        _.each(scope.data, function (loc, i) {
          var marker = new google.maps.Marker({
            map: scope.map,
            position: new google.maps.LatLng(loc.lat, loc.lng),
            index: i
          });
          google.maps.event.addListener(marker, 'click', function () {
            pinClick = true;
            scope.activateItem(this.index);
            scope.$apply();
            pinClick = false;
          });
          markers[i] = marker;
        });
      }

      scope.$watch('activeItem', function (item) {
        if (item) {
          if (!pinClick) {
            scope.map.setCenter(markers[item.index].position);
          }
          infoWindow.setContent(genInfoHtml(scope.data[item.index]));
          infoWindow.open(scope.map, markers[item.index]);
        }
      });

      scope.$watch('data', function (newData, oldData) {
        plotShops();
        //data is only null at page load, so fit map bounds:
        if (oldData === null) {
          fitMapBounds();
        }
      });
    }
  }
});

app.directive('locationSearch', function () {
  return {
    restrict: 'E',
    template: '<div class="search-bar-wrapper">' +
      '<form id="location-search" ng-submit="locationSearch()">' +
        '<a href="#" class="search-bar-icon"><i class="icon-search"></i></a>' +
        '<input ng-model="searchAddress" autofocus placeholder="City, ST" type="text">' +
      '</form>' +
    '</div>',
    link: function (scope, el) {
      function calcDistances(searchPoint) {
        _.each(scope.data, function (loc) {
          var dist = google.maps.geometry.spherical.computeDistanceBetween(
            searchPoint,
            new google.maps.LatLng(loc.lat, loc.lng)
          );
          dist *= 0.000621371; //convert meters to miles
          loc.distance = parseFloat(dist.toFixed());
        });
      }
      function sortByKey(arr, key, desc) {
        var direction = desc ? -1 : 1;
        return arr.sort(function (a, b) {
          var result = a[key] < b[key] ? -1 : a[key] > b[key] ? 1 : 0;
          return result * direction;
        });
      }
      function getGroupedData(arr) {
        var tempArr = _.clone(arr);
        sortByKey(tempArr, 'distance');
        _.each(tempArr, function (loc) {
          var distance = _.find([500, 250, 100, 50, 20, 10, 5, 1], function (dist) {
            return loc.distance >= dist;
          });
          loc.group = distance;
        });
        return _.groupBy(tempArr, 'group');
      }
      function getGroupKeys (obj) {
        return _.map(_.keys(obj), function (item) {
          return parseInt(item);
        }).sort(function (a, b) {
          return a - b;
        });
      }

      scope.locationSearch = function () {
        var geocoder = new google.maps.Geocoder();
        geocoder.geocode({'address': scope.searchAddress}, function (results, status) {
          var lat, lng, result;
          if (results.length) {
            result = results[0].geometry;
            scope.map.fitBounds(result.bounds);
            calcDistances(result.location);
            scope.groupedData = getGroupedData(scope.data);
            scope.groupKeys = getGroupKeys(scope.groupedData);
            scope.queryAddress = scope.searchAddress;
            scope.$apply();
          }
        });
      };
    }
  }
});

app.directive('list', function () {
  return {
    restrict: 'E', 
    templateUrl: 'list.html',
    link: function (scope) {
      scope.isArray = _.isArray;

      scope.$watch('activeItem', function (newItem, oldItem) {
        if (oldItem !== newItem) {
          if (oldItem) {
            oldItem.name = oldItem.name.replace('*', '');
          }
          if (newItem) {
            newItem.name += '*';
          }
        }
      });

      scope.exitSearch = function () {
        scope.searchAddress = '';
        scope.groupedData = scope.data;
      };
    }
  };
});

app.filter('orderByKeys', function () {
  return function (items) {
    console.log('ordering by keys', items);
    return items;
  };
});

app.factory('locationService', ['$httpBackend',
  function ($httpBackend) {
    return {
      initialized: false,
      data: [],
      init: function (callback) {
        var that = this;
        if (!this.initialized) {
          $httpBackend('GET', 'clients.json', null, function (status, data) {
            var parsed;
            if (status === 200) {
              parsed = angular.fromJson(data);
              originalData = parsed;
              that.data = parsed;
              callback(that.data);
            } else {
              console.log('Problem getting data');
            }
          });
        } else {
          callback(this.data);
        }
      }
    };
  }
]);

app.factory('_', function () {
  return _;
});

