/*
   Licensed to the Apache Software Foundation (ASF) under one or more
   contributor license agreements.  See the NOTICE file distributed with
   this work for additional information regarding copyright ownership.
   The ASF licenses this file to You under the Apache License, Version 2.0
   (the "License"); you may not use this file except in compliance with
   the License.  You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

   Unless required by applicable law or agreed to in writing, software
   distributed under the License is distributed on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   See the License for the specific language governing permissions and
   limitations under the License.
*/
$(document).ready(function() {

    $(".click-title").mouseenter( function(    e){
        e.preventDefault();
        this.style.cursor="pointer";
    });
    $(".click-title").mousedown( function(event){
        event.preventDefault();
    });

    // Ugly code while this script is shared among several pages
    try{
        refreshHitsPerSecond(true);
    } catch(e){}
    try{
        refreshResponseTimeOverTime(true);
    } catch(e){}
    try{
        refreshResponseTimePercentiles();
    } catch(e){}
    $(".portlet-header").css("cursor", "auto");
});

var showControllersOnly = false;
var seriesFilter = "";
var filtersOnlySampleSeries = true;

// Fixes time stamps
function fixTimeStamps(series, offset){
    $.each(series, function(index, item) {
        $.each(item.data, function(index, coord) {
            coord[0] += offset;
        });
    });
}

// Check if the specified jquery object is a graph
function isGraph(object){
    return object.data('plot') !== undefined;
}

/**
 * Export graph to a PNG
 */
function exportToPNG(graphName, target) {
    var plot = $("#"+graphName).data('plot');
    var flotCanvas = plot.getCanvas();
    var image = flotCanvas.toDataURL();
    image = image.replace("image/png", "image/octet-stream");
    
    var downloadAttrSupported = ("download" in document.createElement("a"));
    if(downloadAttrSupported === true) {
        target.download = graphName + ".png";
        target.href = image;
    }
    else {
        document.location.href = image;
    }
    
}

// Override the specified graph options to fit the requirements of an overview
function prepareOverviewOptions(graphOptions){
    var overviewOptions = {
        series: {
            shadowSize: 0,
            lines: {
                lineWidth: 1
            },
            points: {
                // Show points on overview only when linked graph does not show
                // lines
                show: getProperty('series.lines.show', graphOptions) == false,
                radius : 1
            }
        },
        xaxis: {
            ticks: 2,
            axisLabel: null
        },
        yaxis: {
            ticks: 2,
            axisLabel: null
        },
        legend: {
            show: false,
            container: null
        },
        grid: {
            hoverable: false
        },
        tooltip: false
    };
    return $.extend(true, {}, graphOptions, overviewOptions);
}

// Force axes boundaries using graph extra options
function prepareOptions(options, data) {
    options.canvas = true;
    var extraOptions = data.extraOptions;
    if(extraOptions !== undefined){
        var xOffset = options.xaxis.mode === "time" ? 19800000 : 0;
        var yOffset = options.yaxis.mode === "time" ? 19800000 : 0;

        if(!isNaN(extraOptions.minX))
        	options.xaxis.min = parseFloat(extraOptions.minX) + xOffset;
        
        if(!isNaN(extraOptions.maxX))
        	options.xaxis.max = parseFloat(extraOptions.maxX) + xOffset;
        
        if(!isNaN(extraOptions.minY))
        	options.yaxis.min = parseFloat(extraOptions.minY) + yOffset;
        
        if(!isNaN(extraOptions.maxY))
        	options.yaxis.max = parseFloat(extraOptions.maxY) + yOffset;
    }
}

// Filter, mark series and sort data
/**
 * @param data
 * @param noMatchColor if defined and true, series.color are not matched with index
 */
function prepareSeries(data, noMatchColor){
    var result = data.result;

    // Keep only series when needed
    if(seriesFilter && (!filtersOnlySampleSeries || result.supportsControllersDiscrimination)){
        // Insensitive case matching
        var regexp = new RegExp(seriesFilter, 'i');
        result.series = $.grep(result.series, function(series, index){
            return regexp.test(series.label);
        });
    }

    // Keep only controllers series when supported and needed
    if(result.supportsControllersDiscrimination && showControllersOnly){
        result.series = $.grep(result.series, function(series, index){
            return series.isController;
        });
    }

    // Sort data and mark series
    $.each(result.series, function(index, series) {
        series.data.sort(compareByXCoordinate);
        if(!(noMatchColor && noMatchColor===true)) {
	        series.color = index;
	    }
    });
}

// Set the zoom on the specified plot object
function zoomPlot(plot, xmin, xmax, ymin, ymax){
    var axes = plot.getAxes();
    // Override axes min and max options
    $.extend(true, axes, {
        xaxis: {
            options : { min: xmin, max: xmax }
        },
        yaxis: {
            options : { min: ymin, max: ymax }
        }
    });

    // Redraw the plot
    plot.setupGrid();
    plot.draw();
}

// Prepares DOM items to add zoom function on the specified graph
function setGraphZoomable(graphSelector, overviewSelector){
    var graph = $(graphSelector);
    var overview = $(overviewSelector);

    // Ignore mouse down event
    graph.bind("mousedown", function() { return false; });
    overview.bind("mousedown", function() { return false; });

    // Zoom on selection
    graph.bind("plotselected", function (event, ranges) {
        // clamp the zooming to prevent infinite zoom
        if (ranges.xaxis.to - ranges.xaxis.from < 0.00001) {
            ranges.xaxis.to = ranges.xaxis.from + 0.00001;
        }
        if (ranges.yaxis.to - ranges.yaxis.from < 0.00001) {
            ranges.yaxis.to = ranges.yaxis.from + 0.00001;
        }

        // Do the zooming
        var plot = graph.data('plot');
        zoomPlot(plot, ranges.xaxis.from, ranges.xaxis.to, ranges.yaxis.from, ranges.yaxis.to);
        plot.clearSelection();

        // Synchronize overview selection
        overview.data('plot').setSelection(ranges, true);
    });

    // Zoom linked graph on overview selection
    overview.bind("plotselected", function (event, ranges) {
        graph.data('plot').setSelection(ranges);
    });

    // Reset linked graph zoom when reseting overview selection
    overview.bind("plotunselected", function () {
        var overviewAxes = overview.data('plot').getAxes();
        zoomPlot(graph.data('plot'), overviewAxes.xaxis.min, overviewAxes.xaxis.max, overviewAxes.yaxis.min, overviewAxes.yaxis.max);
    });
}

var responseTimePercentilesInfos = {
        data: {"result": {"minY": 1005.0, "minX": 0.0, "maxY": 2628.0, "series": [{"data": [[0.0, 1005.0], [0.1, 1005.0], [0.2, 1005.0], [0.3, 1005.0], [0.4, 1005.0], [0.5, 1005.0], [0.6, 1005.0], [0.7, 1005.0], [0.8, 1005.0], [0.9, 1022.0], [1.0, 1022.0], [1.1, 1022.0], [1.2, 1022.0], [1.3, 1022.0], [1.4, 1022.0], [1.5, 1022.0], [1.6, 1022.0], [1.7, 1062.0], [1.8, 1062.0], [1.9, 1062.0], [2.0, 1062.0], [2.1, 1062.0], [2.2, 1062.0], [2.3, 1062.0], [2.4, 1062.0], [2.5, 1064.0], [2.6, 1064.0], [2.7, 1064.0], [2.8, 1064.0], [2.9, 1064.0], [3.0, 1064.0], [3.1, 1064.0], [3.2, 1064.0], [3.3, 1064.0], [3.4, 1224.0], [3.5, 1224.0], [3.6, 1224.0], [3.7, 1224.0], [3.8, 1224.0], [3.9, 1224.0], [4.0, 1224.0], [4.1, 1224.0], [4.2, 1225.0], [4.3, 1225.0], [4.4, 1225.0], [4.5, 1225.0], [4.6, 1225.0], [4.7, 1225.0], [4.8, 1225.0], [4.9, 1225.0], [5.0, 1242.0], [5.1, 1242.0], [5.2, 1242.0], [5.3, 1242.0], [5.4, 1242.0], [5.5, 1242.0], [5.6, 1242.0], [5.7, 1242.0], [5.8, 1242.0], [5.9, 1252.0], [6.0, 1252.0], [6.1, 1252.0], [6.2, 1252.0], [6.3, 1252.0], [6.4, 1252.0], [6.5, 1252.0], [6.6, 1252.0], [6.7, 1304.0], [6.8, 1304.0], [6.9, 1304.0], [7.0, 1304.0], [7.1, 1304.0], [7.2, 1304.0], [7.3, 1304.0], [7.4, 1304.0], [7.5, 1308.0], [7.6, 1308.0], [7.7, 1308.0], [7.8, 1308.0], [7.9, 1308.0], [8.0, 1308.0], [8.1, 1308.0], [8.2, 1308.0], [8.3, 1308.0], [8.4, 1311.0], [8.5, 1311.0], [8.6, 1311.0], [8.7, 1311.0], [8.8, 1311.0], [8.9, 1311.0], [9.0, 1311.0], [9.1, 1311.0], [9.2, 1311.0], [9.3, 1311.0], [9.4, 1311.0], [9.5, 1311.0], [9.6, 1311.0], [9.7, 1311.0], [9.8, 1311.0], [9.9, 1311.0], [10.0, 1319.0], [10.1, 1319.0], [10.2, 1319.0], [10.3, 1319.0], [10.4, 1319.0], [10.5, 1319.0], [10.6, 1319.0], [10.7, 1319.0], [10.8, 1319.0], [10.9, 1332.0], [11.0, 1332.0], [11.1, 1332.0], [11.2, 1332.0], [11.3, 1332.0], [11.4, 1332.0], [11.5, 1332.0], [11.6, 1332.0], [11.7, 1340.0], [11.8, 1340.0], [11.9, 1340.0], [12.0, 1340.0], [12.1, 1340.0], [12.2, 1340.0], [12.3, 1340.0], [12.4, 1340.0], [12.5, 1347.0], [12.6, 1347.0], [12.7, 1347.0], [12.8, 1347.0], [12.9, 1347.0], [13.0, 1347.0], [13.1, 1347.0], [13.2, 1347.0], [13.3, 1347.0], [13.4, 1400.0], [13.5, 1400.0], [13.6, 1400.0], [13.7, 1400.0], [13.8, 1400.0], [13.9, 1400.0], [14.0, 1400.0], [14.1, 1400.0], [14.2, 1425.0], [14.3, 1425.0], [14.4, 1425.0], [14.5, 1425.0], [14.6, 1425.0], [14.7, 1425.0], [14.8, 1425.0], [14.9, 1425.0], [15.0, 1425.0], [15.1, 1430.0], [15.2, 1430.0], [15.3, 1430.0], [15.4, 1430.0], [15.5, 1430.0], [15.6, 1430.0], [15.7, 1430.0], [15.8, 1430.0], [15.9, 1433.0], [16.0, 1433.0], [16.1, 1433.0], [16.2, 1433.0], [16.3, 1433.0], [16.4, 1433.0], [16.5, 1433.0], [16.6, 1433.0], [16.7, 1548.0], [16.8, 1548.0], [16.9, 1548.0], [17.0, 1548.0], [17.1, 1548.0], [17.2, 1548.0], [17.3, 1548.0], [17.4, 1548.0], [17.5, 1628.0], [17.6, 1628.0], [17.7, 1628.0], [17.8, 1628.0], [17.9, 1628.0], [18.0, 1628.0], [18.1, 1628.0], [18.2, 1628.0], [18.3, 1628.0], [18.4, 1688.0], [18.5, 1688.0], [18.6, 1688.0], [18.7, 1688.0], [18.8, 1688.0], [18.9, 1688.0], [19.0, 1688.0], [19.1, 1688.0], [19.2, 1692.0], [19.3, 1692.0], [19.4, 1692.0], [19.5, 1692.0], [19.6, 1692.0], [19.7, 1692.0], [19.8, 1692.0], [19.9, 1692.0], [20.0, 1698.0], [20.1, 1698.0], [20.2, 1698.0], [20.3, 1698.0], [20.4, 1698.0], [20.5, 1698.0], [20.6, 1698.0], [20.7, 1698.0], [20.8, 1698.0], [20.9, 1709.0], [21.0, 1709.0], [21.1, 1709.0], [21.2, 1709.0], [21.3, 1709.0], [21.4, 1709.0], [21.5, 1709.0], [21.6, 1709.0], [21.7, 1728.0], [21.8, 1728.0], [21.9, 1728.0], [22.0, 1728.0], [22.1, 1728.0], [22.2, 1728.0], [22.3, 1728.0], [22.4, 1728.0], [22.5, 1730.0], [22.6, 1730.0], [22.7, 1730.0], [22.8, 1730.0], [22.9, 1730.0], [23.0, 1730.0], [23.1, 1730.0], [23.2, 1730.0], [23.3, 1730.0], [23.4, 1734.0], [23.5, 1734.0], [23.6, 1734.0], [23.7, 1734.0], [23.8, 1734.0], [23.9, 1734.0], [24.0, 1734.0], [24.1, 1734.0], [24.2, 1769.0], [24.3, 1769.0], [24.4, 1769.0], [24.5, 1769.0], [24.6, 1769.0], [24.7, 1769.0], [24.8, 1769.0], [24.9, 1769.0], [25.0, 1771.0], [25.1, 1771.0], [25.2, 1771.0], [25.3, 1771.0], [25.4, 1771.0], [25.5, 1771.0], [25.6, 1771.0], [25.7, 1771.0], [25.8, 1771.0], [25.9, 1792.0], [26.0, 1792.0], [26.1, 1792.0], [26.2, 1792.0], [26.3, 1792.0], [26.4, 1792.0], [26.5, 1792.0], [26.6, 1792.0], [26.7, 1792.0], [26.8, 1792.0], [26.9, 1792.0], [27.0, 1792.0], [27.1, 1792.0], [27.2, 1792.0], [27.3, 1792.0], [27.4, 1792.0], [27.5, 1793.0], [27.6, 1793.0], [27.7, 1793.0], [27.8, 1793.0], [27.9, 1793.0], [28.0, 1793.0], [28.1, 1793.0], [28.2, 1793.0], [28.3, 1793.0], [28.4, 1811.0], [28.5, 1811.0], [28.6, 1811.0], [28.7, 1811.0], [28.8, 1811.0], [28.9, 1811.0], [29.0, 1811.0], [29.1, 1811.0], [29.2, 1813.0], [29.3, 1813.0], [29.4, 1813.0], [29.5, 1813.0], [29.6, 1813.0], [29.7, 1813.0], [29.8, 1813.0], [29.9, 1813.0], [30.0, 1815.0], [30.1, 1815.0], [30.2, 1815.0], [30.3, 1815.0], [30.4, 1815.0], [30.5, 1815.0], [30.6, 1815.0], [30.7, 1815.0], [30.8, 1815.0], [30.9, 1827.0], [31.0, 1827.0], [31.1, 1827.0], [31.2, 1827.0], [31.3, 1827.0], [31.4, 1827.0], [31.5, 1827.0], [31.6, 1827.0], [31.7, 1828.0], [31.8, 1828.0], [31.9, 1828.0], [32.0, 1828.0], [32.1, 1828.0], [32.2, 1828.0], [32.3, 1828.0], [32.4, 1828.0], [32.5, 1836.0], [32.6, 1836.0], [32.7, 1836.0], [32.8, 1836.0], [32.9, 1836.0], [33.0, 1836.0], [33.1, 1836.0], [33.2, 1836.0], [33.3, 1836.0], [33.4, 1880.0], [33.5, 1880.0], [33.6, 1880.0], [33.7, 1880.0], [33.8, 1880.0], [33.9, 1880.0], [34.0, 1880.0], [34.1, 1880.0], [34.2, 1913.0], [34.3, 1913.0], [34.4, 1913.0], [34.5, 1913.0], [34.6, 1913.0], [34.7, 1913.0], [34.8, 1913.0], [34.9, 1913.0], [35.0, 1932.0], [35.1, 1932.0], [35.2, 1932.0], [35.3, 1932.0], [35.4, 1932.0], [35.5, 1932.0], [35.6, 1932.0], [35.7, 1932.0], [35.8, 1932.0], [35.9, 1935.0], [36.0, 1935.0], [36.1, 1935.0], [36.2, 1935.0], [36.3, 1935.0], [36.4, 1935.0], [36.5, 1935.0], [36.6, 1935.0], [36.7, 1938.0], [36.8, 1938.0], [36.9, 1938.0], [37.0, 1938.0], [37.1, 1938.0], [37.2, 1938.0], [37.3, 1938.0], [37.4, 1938.0], [37.5, 1963.0], [37.6, 1963.0], [37.7, 1963.0], [37.8, 1963.0], [37.9, 1963.0], [38.0, 1963.0], [38.1, 1963.0], [38.2, 1963.0], [38.3, 1963.0], [38.4, 1965.0], [38.5, 1965.0], [38.6, 1965.0], [38.7, 1965.0], [38.8, 1965.0], [38.9, 1965.0], [39.0, 1965.0], [39.1, 1965.0], [39.2, 1970.0], [39.3, 1970.0], [39.4, 1970.0], [39.5, 1970.0], [39.6, 1970.0], [39.7, 1970.0], [39.8, 1970.0], [39.9, 1970.0], [40.0, 1970.0], [40.1, 1978.0], [40.2, 1978.0], [40.3, 1978.0], [40.4, 1978.0], [40.5, 1978.0], [40.6, 1978.0], [40.7, 1978.0], [40.8, 1978.0], [40.9, 1979.0], [41.0, 1979.0], [41.1, 1979.0], [41.2, 1979.0], [41.3, 1979.0], [41.4, 1979.0], [41.5, 1979.0], [41.6, 1979.0], [41.7, 1980.0], [41.8, 1980.0], [41.9, 1980.0], [42.0, 1980.0], [42.1, 1980.0], [42.2, 1980.0], [42.3, 1980.0], [42.4, 1980.0], [42.5, 1980.0], [42.6, 1980.0], [42.7, 1980.0], [42.8, 1980.0], [42.9, 1980.0], [43.0, 1980.0], [43.1, 1980.0], [43.2, 1980.0], [43.3, 1980.0], [43.4, 1983.0], [43.5, 1983.0], [43.6, 1983.0], [43.7, 1983.0], [43.8, 1983.0], [43.9, 1983.0], [44.0, 1983.0], [44.1, 1983.0], [44.2, 1987.0], [44.3, 1987.0], [44.4, 1987.0], [44.5, 1987.0], [44.6, 1987.0], [44.7, 1987.0], [44.8, 1987.0], [44.9, 1987.0], [45.0, 1987.0], [45.1, 1998.0], [45.2, 1998.0], [45.3, 1998.0], [45.4, 1998.0], [45.5, 1998.0], [45.6, 1998.0], [45.7, 1998.0], [45.8, 1998.0], [45.9, 2004.0], [46.0, 2004.0], [46.1, 2004.0], [46.2, 2004.0], [46.3, 2004.0], [46.4, 2004.0], [46.5, 2004.0], [46.6, 2004.0], [46.7, 2004.0], [46.8, 2004.0], [46.9, 2004.0], [47.0, 2004.0], [47.1, 2004.0], [47.2, 2004.0], [47.3, 2004.0], [47.4, 2004.0], [47.5, 2004.0], [47.6, 2014.0], [47.7, 2014.0], [47.8, 2014.0], [47.9, 2014.0], [48.0, 2014.0], [48.1, 2014.0], [48.2, 2014.0], [48.3, 2014.0], [48.4, 2023.0], [48.5, 2023.0], [48.6, 2023.0], [48.7, 2023.0], [48.8, 2023.0], [48.9, 2023.0], [49.0, 2023.0], [49.1, 2023.0], [49.2, 2030.0], [49.3, 2030.0], [49.4, 2030.0], [49.5, 2030.0], [49.6, 2030.0], [49.7, 2030.0], [49.8, 2030.0], [49.9, 2030.0], [50.0, 2030.0], [50.1, 2032.0], [50.2, 2032.0], [50.3, 2032.0], [50.4, 2032.0], [50.5, 2032.0], [50.6, 2032.0], [50.7, 2032.0], [50.8, 2032.0], [50.9, 2040.0], [51.0, 2040.0], [51.1, 2040.0], [51.2, 2040.0], [51.3, 2040.0], [51.4, 2040.0], [51.5, 2040.0], [51.6, 2040.0], [51.7, 2043.0], [51.8, 2043.0], [51.9, 2043.0], [52.0, 2043.0], [52.1, 2043.0], [52.2, 2043.0], [52.3, 2043.0], [52.4, 2043.0], [52.5, 2043.0], [52.6, 2045.0], [52.7, 2045.0], [52.8, 2045.0], [52.9, 2045.0], [53.0, 2045.0], [53.1, 2045.0], [53.2, 2045.0], [53.3, 2045.0], [53.4, 2083.0], [53.5, 2083.0], [53.6, 2083.0], [53.7, 2083.0], [53.8, 2083.0], [53.9, 2083.0], [54.0, 2083.0], [54.1, 2083.0], [54.2, 2096.0], [54.3, 2096.0], [54.4, 2096.0], [54.5, 2096.0], [54.6, 2096.0], [54.7, 2096.0], [54.8, 2096.0], [54.9, 2096.0], [55.0, 2096.0], [55.1, 2096.0], [55.2, 2096.0], [55.3, 2096.0], [55.4, 2096.0], [55.5, 2096.0], [55.6, 2096.0], [55.7, 2096.0], [55.8, 2096.0], [55.9, 2109.0], [56.0, 2109.0], [56.1, 2109.0], [56.2, 2109.0], [56.3, 2109.0], [56.4, 2109.0], [56.5, 2109.0], [56.6, 2109.0], [56.7, 2111.0], [56.8, 2111.0], [56.9, 2111.0], [57.0, 2111.0], [57.1, 2111.0], [57.2, 2111.0], [57.3, 2111.0], [57.4, 2111.0], [57.5, 2111.0], [57.6, 2112.0], [57.7, 2112.0], [57.8, 2112.0], [57.9, 2112.0], [58.0, 2112.0], [58.1, 2112.0], [58.2, 2112.0], [58.3, 2112.0], [58.4, 2118.0], [58.5, 2118.0], [58.6, 2118.0], [58.7, 2118.0], [58.8, 2118.0], [58.9, 2118.0], [59.0, 2118.0], [59.1, 2118.0], [59.2, 2121.0], [59.3, 2121.0], [59.4, 2121.0], [59.5, 2121.0], [59.6, 2121.0], [59.7, 2121.0], [59.8, 2121.0], [59.9, 2121.0], [60.0, 2121.0], [60.1, 2124.0], [60.2, 2124.0], [60.3, 2124.0], [60.4, 2124.0], [60.5, 2124.0], [60.6, 2124.0], [60.7, 2124.0], [60.8, 2124.0], [60.9, 2133.0], [61.0, 2133.0], [61.1, 2133.0], [61.2, 2133.0], [61.3, 2133.0], [61.4, 2133.0], [61.5, 2133.0], [61.6, 2133.0], [61.7, 2136.0], [61.8, 2136.0], [61.9, 2136.0], [62.0, 2136.0], [62.1, 2136.0], [62.2, 2136.0], [62.3, 2136.0], [62.4, 2136.0], [62.5, 2136.0], [62.6, 2142.0], [62.7, 2142.0], [62.8, 2142.0], [62.9, 2142.0], [63.0, 2142.0], [63.1, 2142.0], [63.2, 2142.0], [63.3, 2142.0], [63.4, 2145.0], [63.5, 2145.0], [63.6, 2145.0], [63.7, 2145.0], [63.8, 2145.0], [63.9, 2145.0], [64.0, 2145.0], [64.1, 2145.0], [64.2, 2161.0], [64.3, 2161.0], [64.4, 2161.0], [64.5, 2161.0], [64.6, 2161.0], [64.7, 2161.0], [64.8, 2161.0], [64.9, 2161.0], [65.0, 2161.0], [65.1, 2172.0], [65.2, 2172.0], [65.3, 2172.0], [65.4, 2172.0], [65.5, 2172.0], [65.6, 2172.0], [65.7, 2172.0], [65.8, 2172.0], [65.9, 2175.0], [66.0, 2175.0], [66.1, 2175.0], [66.2, 2175.0], [66.3, 2175.0], [66.4, 2175.0], [66.5, 2175.0], [66.6, 2175.0], [66.7, 2177.0], [66.8, 2177.0], [66.9, 2177.0], [67.0, 2177.0], [67.1, 2177.0], [67.2, 2177.0], [67.3, 2177.0], [67.4, 2177.0], [67.5, 2177.0], [67.6, 2184.0], [67.7, 2184.0], [67.8, 2184.0], [67.9, 2184.0], [68.0, 2184.0], [68.1, 2184.0], [68.2, 2184.0], [68.3, 2184.0], [68.4, 2185.0], [68.5, 2185.0], [68.6, 2185.0], [68.7, 2185.0], [68.8, 2185.0], [68.9, 2185.0], [69.0, 2185.0], [69.1, 2185.0], [69.2, 2188.0], [69.3, 2188.0], [69.4, 2188.0], [69.5, 2188.0], [69.6, 2188.0], [69.7, 2188.0], [69.8, 2188.0], [69.9, 2188.0], [70.0, 2188.0], [70.1, 2189.0], [70.2, 2189.0], [70.3, 2189.0], [70.4, 2189.0], [70.5, 2189.0], [70.6, 2189.0], [70.7, 2189.0], [70.8, 2189.0], [70.9, 2190.0], [71.0, 2190.0], [71.1, 2190.0], [71.2, 2190.0], [71.3, 2190.0], [71.4, 2190.0], [71.5, 2190.0], [71.6, 2190.0], [71.7, 2190.0], [71.8, 2190.0], [71.9, 2190.0], [72.0, 2190.0], [72.1, 2190.0], [72.2, 2190.0], [72.3, 2190.0], [72.4, 2190.0], [72.5, 2190.0], [72.6, 2196.0], [72.7, 2196.0], [72.8, 2196.0], [72.9, 2196.0], [73.0, 2196.0], [73.1, 2196.0], [73.2, 2196.0], [73.3, 2196.0], [73.4, 2202.0], [73.5, 2202.0], [73.6, 2202.0], [73.7, 2202.0], [73.8, 2202.0], [73.9, 2202.0], [74.0, 2202.0], [74.1, 2202.0], [74.2, 2203.0], [74.3, 2203.0], [74.4, 2203.0], [74.5, 2203.0], [74.6, 2203.0], [74.7, 2203.0], [74.8, 2203.0], [74.9, 2203.0], [75.0, 2209.0], [75.1, 2209.0], [75.2, 2209.0], [75.3, 2209.0], [75.4, 2209.0], [75.5, 2209.0], [75.6, 2209.0], [75.7, 2209.0], [75.8, 2209.0], [75.9, 2217.0], [76.0, 2217.0], [76.1, 2217.0], [76.2, 2217.0], [76.3, 2217.0], [76.4, 2217.0], [76.5, 2217.0], [76.6, 2217.0], [76.7, 2219.0], [76.8, 2219.0], [76.9, 2219.0], [77.0, 2219.0], [77.1, 2219.0], [77.2, 2219.0], [77.3, 2219.0], [77.4, 2219.0], [77.5, 2220.0], [77.6, 2220.0], [77.7, 2220.0], [77.8, 2220.0], [77.9, 2220.0], [78.0, 2220.0], [78.1, 2220.0], [78.2, 2220.0], [78.3, 2220.0], [78.4, 2227.0], [78.5, 2227.0], [78.6, 2227.0], [78.7, 2227.0], [78.8, 2227.0], [78.9, 2227.0], [79.0, 2227.0], [79.1, 2227.0], [79.2, 2230.0], [79.3, 2230.0], [79.4, 2230.0], [79.5, 2230.0], [79.6, 2230.0], [79.7, 2230.0], [79.8, 2230.0], [79.9, 2230.0], [80.0, 2247.0], [80.1, 2247.0], [80.2, 2247.0], [80.3, 2247.0], [80.4, 2247.0], [80.5, 2247.0], [80.6, 2247.0], [80.7, 2247.0], [80.8, 2247.0], [80.9, 2249.0], [81.0, 2249.0], [81.1, 2249.0], [81.2, 2249.0], [81.3, 2249.0], [81.4, 2249.0], [81.5, 2249.0], [81.6, 2249.0], [81.7, 2256.0], [81.8, 2256.0], [81.9, 2256.0], [82.0, 2256.0], [82.1, 2256.0], [82.2, 2256.0], [82.3, 2256.0], [82.4, 2256.0], [82.5, 2261.0], [82.6, 2261.0], [82.7, 2261.0], [82.8, 2261.0], [82.9, 2261.0], [83.0, 2261.0], [83.1, 2261.0], [83.2, 2261.0], [83.3, 2261.0], [83.4, 2265.0], [83.5, 2265.0], [83.6, 2265.0], [83.7, 2265.0], [83.8, 2265.0], [83.9, 2265.0], [84.0, 2265.0], [84.1, 2265.0], [84.2, 2273.0], [84.3, 2273.0], [84.4, 2273.0], [84.5, 2273.0], [84.6, 2273.0], [84.7, 2273.0], [84.8, 2273.0], [84.9, 2273.0], [85.0, 2275.0], [85.1, 2275.0], [85.2, 2275.0], [85.3, 2275.0], [85.4, 2275.0], [85.5, 2275.0], [85.6, 2275.0], [85.7, 2275.0], [85.8, 2275.0], [85.9, 2282.0], [86.0, 2282.0], [86.1, 2282.0], [86.2, 2282.0], [86.3, 2282.0], [86.4, 2282.0], [86.5, 2282.0], [86.6, 2282.0], [86.7, 2283.0], [86.8, 2283.0], [86.9, 2283.0], [87.0, 2283.0], [87.1, 2283.0], [87.2, 2283.0], [87.3, 2283.0], [87.4, 2283.0], [87.5, 2292.0], [87.6, 2292.0], [87.7, 2292.0], [87.8, 2292.0], [87.9, 2292.0], [88.0, 2292.0], [88.1, 2292.0], [88.2, 2292.0], [88.3, 2292.0], [88.4, 2299.0], [88.5, 2299.0], [88.6, 2299.0], [88.7, 2299.0], [88.8, 2299.0], [88.9, 2299.0], [89.0, 2299.0], [89.1, 2299.0], [89.2, 2307.0], [89.3, 2307.0], [89.4, 2307.0], [89.5, 2307.0], [89.6, 2307.0], [89.7, 2307.0], [89.8, 2307.0], [89.9, 2307.0], [90.0, 2311.0], [90.1, 2311.0], [90.2, 2311.0], [90.3, 2311.0], [90.4, 2311.0], [90.5, 2311.0], [90.6, 2311.0], [90.7, 2311.0], [90.8, 2311.0], [90.9, 2313.0], [91.0, 2313.0], [91.1, 2313.0], [91.2, 2313.0], [91.3, 2313.0], [91.4, 2313.0], [91.5, 2313.0], [91.6, 2313.0], [91.7, 2313.0], [91.8, 2313.0], [91.9, 2313.0], [92.0, 2313.0], [92.1, 2313.0], [92.2, 2313.0], [92.3, 2313.0], [92.4, 2313.0], [92.5, 2320.0], [92.6, 2320.0], [92.7, 2320.0], [92.8, 2320.0], [92.9, 2320.0], [93.0, 2320.0], [93.1, 2320.0], [93.2, 2320.0], [93.3, 2320.0], [93.4, 2326.0], [93.5, 2326.0], [93.6, 2326.0], [93.7, 2326.0], [93.8, 2326.0], [93.9, 2326.0], [94.0, 2326.0], [94.1, 2326.0], [94.2, 2331.0], [94.3, 2331.0], [94.4, 2331.0], [94.5, 2331.0], [94.6, 2331.0], [94.7, 2331.0], [94.8, 2331.0], [94.9, 2331.0], [95.0, 2335.0], [95.1, 2335.0], [95.2, 2335.0], [95.3, 2335.0], [95.4, 2335.0], [95.5, 2335.0], [95.6, 2335.0], [95.7, 2335.0], [95.8, 2335.0], [95.9, 2338.0], [96.0, 2338.0], [96.1, 2338.0], [96.2, 2338.0], [96.3, 2338.0], [96.4, 2338.0], [96.5, 2338.0], [96.6, 2338.0], [96.7, 2340.0], [96.8, 2340.0], [96.9, 2340.0], [97.0, 2340.0], [97.1, 2340.0], [97.2, 2340.0], [97.3, 2340.0], [97.4, 2340.0], [97.5, 2351.0], [97.6, 2351.0], [97.7, 2351.0], [97.8, 2351.0], [97.9, 2351.0], [98.0, 2351.0], [98.1, 2351.0], [98.2, 2351.0], [98.3, 2351.0], [98.4, 2430.0], [98.5, 2430.0], [98.6, 2430.0], [98.7, 2430.0], [98.8, 2430.0], [98.9, 2430.0], [99.0, 2430.0], [99.1, 2430.0], [99.2, 2628.0], [99.3, 2628.0], [99.4, 2628.0], [99.5, 2628.0], [99.6, 2628.0], [99.7, 2628.0], [99.8, 2628.0], [99.9, 2628.0]], "isOverall": false, "label": "HTTP Request", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 100.0, "title": "Response Time Percentiles"}},
        getOptions: function() {
            return {
                series: {
                    points: { show: false }
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendResponseTimePercentiles'
                },
                xaxis: {
                    tickDecimals: 1,
                    axisLabel: "Percentiles",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Percentile value in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : %x.2 percentile was %y ms"
                },
                selection: { mode: "xy" },
            };
        },
        createGraph: function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesResponseTimePercentiles"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotResponseTimesPercentiles"), dataset, options);
            // setup overview
            $.plot($("#overviewResponseTimesPercentiles"), dataset, prepareOverviewOptions(options));
        }
};

// Response times percentiles
function refreshResponseTimePercentiles() {
    var infos = responseTimePercentilesInfos;
    prepareSeries(infos.data);
    if (isGraph($("#flotResponseTimesPercentiles"))){
        infos.createGraph();
    } else {
        var choiceContainer = $("#choicesResponseTimePercentiles");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotResponseTimesPercentiles", "#overviewResponseTimesPercentiles");
        $('#bodyResponseTimePercentiles .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
}

var responseTimeDistributionInfos = {
        data: {"result": {"minY": 1.0, "minX": 1000.0, "maxY": 64.0, "series": [{"data": [[2500.0, 1.0], [1500.0, 35.0], [1000.0, 20.0], [2000.0, 64.0]], "isOverall": false, "label": "HTTP Request", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 500, "maxX": 2500.0, "title": "Response Time Distribution"}},
        getOptions: function() {
            var granularity = this.data.result.granularity;
            return {
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendResponseTimeDistribution'
                },
                xaxis:{
                    axisLabel: "Response times in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of responses",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                bars : {
                    show: true,
                    barWidth: this.data.result.granularity
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: function(label, xval, yval, flotItem){
                        return yval + " responses for " + label + " were between " + xval + " and " + (xval + granularity) + " ms";
                    }
                }
            };
        },
        createGraph: function() {
            var data = this.data;
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotResponseTimeDistribution"), prepareData(data.result.series, $("#choicesResponseTimeDistribution")), options);
        }

};

// Response time distribution
function refreshResponseTimeDistribution() {
    var infos = responseTimeDistributionInfos;
    prepareSeries(infos.data);
    if (isGraph($("#flotResponseTimeDistribution"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesResponseTimeDistribution");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        $('#footerResponseTimeDistribution .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};


var syntheticResponseTimeDistributionInfos = {
        data: {"result": {"minY": 20.0, "minX": 1.0, "ticks": [[0, "Requests having \nresponse time <= 500ms"], [1, "Requests having \nresponse time > 500ms and <= 1,500ms"], [2, "Requests having \nresponse time > 1,500ms"], [3, "Requests in error"]], "maxY": 100.0, "series": [{"data": [[1.0, 20.0]], "isOverall": false, "label": "Requests having \nresponse time > 500ms and <= 1,500ms", "isController": false}, {"data": [[2.0, 100.0]], "isOverall": false, "label": "Requests having \nresponse time > 1,500ms", "isController": false}], "supportsControllersDiscrimination": false, "maxX": 2.0, "title": "Synthetic Response Times Distribution"}},
        getOptions: function() {
            return {
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendSyntheticResponseTimeDistribution'
                },
                xaxis:{
                    axisLabel: "Response times ranges",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                    tickLength:0,
                    min:-0.5,
                    max:3.5
                },
                yaxis: {
                    axisLabel: "Number of responses",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                bars : {
                    show: true,
                    align: "center",
                    barWidth: 0.25,
                    fill:.75
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: function(label, xval, yval, flotItem){
                        return yval + " " + label;
                    }
                },
                colors: ["#9ACD32", "yellow", "orange", "#FF6347"]                
            };
        },
        createGraph: function() {
            var data = this.data;
            var options = this.getOptions();
            prepareOptions(options, data);
            options.xaxis.ticks = data.result.ticks;
            $.plot($("#flotSyntheticResponseTimeDistribution"), prepareData(data.result.series, $("#choicesSyntheticResponseTimeDistribution")), options);
        }

};

// Response time distribution
function refreshSyntheticResponseTimeDistribution() {
    var infos = syntheticResponseTimeDistributionInfos;
    prepareSeries(infos.data, true);
    if (isGraph($("#flotSyntheticResponseTimeDistribution"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesSyntheticResponseTimeDistribution");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        $('#footerSyntheticResponseTimeDistribution .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var activeThreadsOverTimeInfos = {
        data: {"result": {"minY": 60.59166666666665, "minX": 1.51549476E12, "maxY": 60.59166666666665, "series": [{"data": [[1.51549476E12, 60.59166666666665]], "isOverall": false, "label": "Thread Group", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.51549476E12, "title": "Active Threads Over Time"}},
        getOptions: function() {
            return {
                series: {
                    stack: true,
                    lines: {
                        show: true,
                        fill: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of active threads",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                legend: {
                    noColumns: 6,
                    show: true,
                    container: '#legendActiveThreadsOverTime'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                selection: {
                    mode: 'xy'
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : At %x there were %y active threads"
                }
            };
        },
        createGraph: function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesActiveThreadsOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotActiveThreadsOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewActiveThreadsOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Active Threads Over Time
function refreshActiveThreadsOverTime(fixTimestamps) {
    var infos = activeThreadsOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 19800000);
    }
    if(isGraph($("#flotActiveThreadsOverTime"))) {
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesActiveThreadsOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotActiveThreadsOverTime", "#overviewActiveThreadsOverTime");
        $('#footerActiveThreadsOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var timeVsThreadsInfos = {
        data: {"result": {"minY": 1038.25, "minX": 1.0, "maxY": 2628.0, "series": [{"data": [[2.0, 2430.0], [3.0, 2331.0], [4.0, 2340.0], [5.0, 2283.0], [6.0, 2307.0], [7.0, 2320.0], [8.0, 2335.0], [9.0, 2351.0], [10.0, 2311.0], [11.0, 2313.0], [12.0, 2265.0], [13.0, 2338.0], [14.0, 2275.0], [15.0, 2313.0], [16.0, 2261.0], [17.0, 2217.0], [18.0, 2219.0], [19.0, 2256.0], [20.0, 1980.0], [21.0, 1965.0], [22.0, 2096.0], [24.0, 1983.0], [25.0, 1998.0], [26.0, 2273.0], [27.0, 2111.0], [28.0, 2004.0], [29.0, 2133.0], [30.0, 2096.0], [31.0, 2190.0], [33.0, 2145.0], [32.0, 2112.0], [35.0, 2004.0], [34.0, 2032.0], [37.0, 2118.0], [36.0, 2189.0], [39.0, 2124.0], [38.0, 2142.0], [41.0, 2161.0], [40.0, 2196.0], [43.0, 2172.0], [42.0, 2045.0], [45.0, 2014.0], [44.0, 1978.0], [47.0, 1983.0], [46.0, 2185.0], [49.0, 2299.0], [48.0, 2282.0], [51.0, 1935.0], [50.0, 2109.0], [53.0, 2230.0], [52.0, 1980.0], [55.0, 2190.0], [54.0, 2209.0], [57.0, 2136.0], [56.0, 2177.0], [59.0, 2220.0], [58.0, 2023.0], [61.0, 2292.0], [60.0, 2227.0], [63.0, 2184.0], [62.0, 2175.0], [67.0, 2249.0], [66.0, 2202.0], [65.0, 2203.0], [64.0, 2030.0], [71.0, 2083.0], [70.0, 2188.0], [69.0, 2247.0], [68.0, 2326.0], [75.0, 2040.0], [74.0, 2082.0], [72.0, 1963.0], [79.0, 1828.0], [78.0, 1827.0], [77.0, 1938.0], [76.0, 1880.0], [83.0, 1734.0], [82.0, 1792.0], [81.0, 1792.0], [80.0, 1793.0], [87.0, 1771.0], [86.0, 1728.0], [85.0, 1970.0], [84.0, 1836.0], [91.0, 1932.0], [90.0, 1913.0], [89.0, 1730.0], [88.0, 1769.0], [95.0, 1709.0], [94.0, 1813.0], [93.0, 1815.0], [92.0, 1811.0], [99.0, 1692.0], [98.0, 1698.0], [97.0, 1548.0], [96.0, 1628.0], [102.0, 1433.0], [101.0, 1430.0], [100.0, 1688.0], [107.0, 1425.0], [106.0, 1309.5], [105.0, 1311.0], [104.0, 1252.0], [111.0, 1242.0], [110.0, 1225.0], [109.0, 1347.0], [108.0, 1400.0], [115.0, 1332.0], [114.0, 1319.0], [113.0, 1340.0], [112.0, 1224.0], [116.0, 1304.0], [120.0, 1038.25], [1.0, 2628.0]], "isOverall": false, "label": "HTTP Request", "isController": false}, {"data": [[60.59166666666665, 1940.4916666666672]], "isOverall": false, "label": "HTTP Request-Aggregated", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 120.0, "title": "Time VS Threads"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    axisLabel: "Number of active threads",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Average response times in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                legend: { noColumns: 2,show: true, container: '#legendTimeVsThreads' },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s: At %x.2 active threads, Average response time was %y.2 ms"
                }
            };
        },
        createGraph: function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesTimeVsThreads"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotTimesVsThreads"), dataset, options);
            // setup overview
            $.plot($("#overviewTimesVsThreads"), dataset, prepareOverviewOptions(options));
        }
};

// Time vs threads
function refreshTimeVsThreads(){
    var infos = timeVsThreadsInfos;
    prepareSeries(infos.data);
    if(isGraph($("#flotTimesVsThreads"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesTimeVsThreads");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotTimesVsThreads", "#overviewTimesVsThreads");
        $('#footerTimeVsThreads .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var bytesThroughputOverTimeInfos = {
        data : {"result": {"minY": 362.0, "minX": 1.51549476E12, "maxY": 31664.0, "series": [{"data": [[1.51549476E12, 31664.0]], "isOverall": false, "label": "Bytes received per second", "isController": false}, {"data": [[1.51549476E12, 362.0]], "isOverall": false, "label": "Bytes sent per second", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.51549476E12, "title": "Bytes Throughput Over Time"}},
        getOptions : function(){
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity) ,
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Bytes/sec",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendBytesThroughputOverTime'
                },
                selection: {
                    mode: "xy"
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s at %x was %y"
                }
            };
        },
        createGraph : function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesBytesThroughputOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotBytesThroughputOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewBytesThroughputOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Bytes throughput Over Time
function refreshBytesThroughputOverTime(fixTimestamps) {
    var infos = bytesThroughputOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 19800000);
    }
    if(isGraph($("#flotBytesThroughputOverTime"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesBytesThroughputOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotBytesThroughputOverTime", "#overviewBytesThroughputOverTime");
        $('#footerBytesThroughputOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
}

var responseTimesOverTimeInfos = {
        data: {"result": {"minY": 1940.4916666666672, "minX": 1.51549476E12, "maxY": 1940.4916666666672, "series": [{"data": [[1.51549476E12, 1940.4916666666672]], "isOverall": false, "label": "HTTP Request", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.51549476E12, "title": "Response Time Over Time"}},
        getOptions: function(){
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Response time in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendResponseTimesOverTime'
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : at %x Average response time was %y ms"
                }
            };
        },
        createGraph: function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesResponseTimesOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotResponseTimesOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewResponseTimesOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Response Times Over Time
function refreshResponseTimeOverTime(fixTimestamps) {
    var infos = responseTimesOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 19800000);
    }
    if(isGraph($("#flotResponseTimesOverTime"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesResponseTimesOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotResponseTimesOverTime", "#overviewResponseTimesOverTime");
        $('#footerResponseTimesOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var latenciesOverTimeInfos = {
        data: {"result": {"minY": 1933.0416666666672, "minX": 1.51549476E12, "maxY": 1933.0416666666672, "series": [{"data": [[1.51549476E12, 1933.0416666666672]], "isOverall": false, "label": "HTTP Request", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.51549476E12, "title": "Latencies Over Time"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Response latencies in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendLatenciesOverTime'
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : at %x Average latency was %y ms"
                }
            };
        },
        createGraph: function () {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesLatenciesOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotLatenciesOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewLatenciesOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Latencies Over Time
function refreshLatenciesOverTime(fixTimestamps) {
    var infos = latenciesOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 19800000);
    }
    if(isGraph($("#flotLatenciesOverTime"))) {
        infos.createGraph();
    }else {
        var choiceContainer = $("#choicesLatenciesOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotLatenciesOverTime", "#overviewLatenciesOverTime");
        $('#footerLatenciesOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var connectTimeOverTimeInfos = {
        data: {"result": {"minY": 19.79999999999999, "minX": 1.51549476E12, "maxY": 19.79999999999999, "series": [{"data": [[1.51549476E12, 19.79999999999999]], "isOverall": false, "label": "HTTP Request", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.51549476E12, "title": "Connect Time Over Time"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getConnectTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Average Connect Time in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendConnectTimeOverTime'
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : at %x Average connect time was %y ms"
                }
            };
        },
        createGraph: function () {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesConnectTimeOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotConnectTimeOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewConnectTimeOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Connect Time Over Time
function refreshConnectTimeOverTime(fixTimestamps) {
    var infos = connectTimeOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 19800000);
    }
    if(isGraph($("#flotConnectTimeOverTime"))) {
        infos.createGraph();
    }else {
        var choiceContainer = $("#choicesConnectTimeOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotConnectTimeOverTime", "#overviewConnectTimeOverTime");
        $('#footerConnectTimeOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var responseTimePercentilesOverTimeInfos = {
        data: {"result": {"minY": 1005.0, "minX": 1.51549476E12, "maxY": 2628.0, "series": [{"data": [[1.51549476E12, 2628.0]], "isOverall": false, "label": "Max", "isController": false}, {"data": [[1.51549476E12, 1005.0]], "isOverall": false, "label": "Min", "isController": false}, {"data": [[1.51549476E12, 2310.6]], "isOverall": false, "label": "90th percentile", "isController": false}, {"data": [[1.51549476E12, 2586.4199999999983]], "isOverall": false, "label": "99th percentile", "isController": false}, {"data": [[1.51549476E12, 2334.8]], "isOverall": false, "label": "95th percentile", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.51549476E12, "title": "Response Time Percentiles Over Time (successful requests only)"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true,
                        fill: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Response Time in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendResponseTimePercentilesOverTime'
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : at %x Response time was %y ms"
                }
            };
        },
        createGraph: function () {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesResponseTimePercentilesOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotResponseTimePercentilesOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewResponseTimePercentilesOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Response Time Percentiles Over Time
function refreshResponseTimePercentilesOverTime(fixTimestamps) {
    var infos = responseTimePercentilesOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 19800000);
    }
    if(isGraph($("#flotResponseTimePercentilesOverTime"))) {
        infos.createGraph();
    }else {
        var choiceContainer = $("#choicesResponseTimePercentilesOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotResponseTimePercentilesOverTime", "#overviewResponseTimePercentilesOverTime");
        $('#footerResponseTimePercentilesOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};


var responseTimeVsRequestInfos = {
    data: {"result": {"minY": 2031.0, "minX": 2.0, "maxY": 2031.0, "series": [{"data": [[2.0, 2031.0]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 2.0, "title": "Response Time Vs Request"}},
    getOptions: function() {
        return {
            series: {
                lines: {
                    show: false
                },
                points: {
                    show: true
                }
            },
            xaxis: {
                axisLabel: "Global number of requests per second",
                axisLabelUseCanvas: true,
                axisLabelFontSizePixels: 12,
                axisLabelFontFamily: 'Verdana, Arial',
                axisLabelPadding: 20,
            },
            yaxis: {
                axisLabel: "Median Response Time (ms)",
                axisLabelUseCanvas: true,
                axisLabelFontSizePixels: 12,
                axisLabelFontFamily: 'Verdana, Arial',
                axisLabelPadding: 20,
            },
            legend: {
                noColumns: 2,
                show: true,
                container: '#legendResponseTimeVsRequest'
            },
            selection: {
                mode: 'xy'
            },
            grid: {
                hoverable: true // IMPORTANT! this is needed for tooltip to work
            },
            tooltip: true,
            tooltipOpts: {
                content: "%s : Median response time at %x req/s was %y ms"
            },
            colors: ["#9ACD32", "#FF6347"]
        };
    },
    createGraph: function () {
        var data = this.data;
        var dataset = prepareData(data.result.series, $("#choicesResponseTimeVsRequest"));
        var options = this.getOptions();
        prepareOptions(options, data);
        $.plot($("#flotResponseTimeVsRequest"), dataset, options);
        // setup overview
        $.plot($("#overviewResponseTimeVsRequest"), dataset, prepareOverviewOptions(options));

    }
};

// Response Time vs Request
function refreshResponseTimeVsRequest() {
    var infos = responseTimeVsRequestInfos;
    prepareSeries(infos.data);
    if (isGraph($("#flotResponseTimeVsRequest"))){
        infos.create();
    }else{
        var choiceContainer = $("#choicesResponseTimeVsRequest");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotResponseTimeVsRequest", "#overviewResponseTimeVsRequest");
        $('#footerResponseRimeVsRequest .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};


var latenciesVsRequestInfos = {
    data: {"result": {"minY": 2020.0, "minX": 2.0, "maxY": 2020.0, "series": [{"data": [[2.0, 2020.0]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 2.0, "title": "Latencies Vs Request"}},
    getOptions: function() {
        return{
            series: {
                lines: {
                    show: false
                },
                points: {
                    show: true
                }
            },
            xaxis: {
                axisLabel: "Global number of requests per second",
                axisLabelUseCanvas: true,
                axisLabelFontSizePixels: 12,
                axisLabelFontFamily: 'Verdana, Arial',
                axisLabelPadding: 20,
            },
            yaxis: {
                axisLabel: "Median Latency (ms)",
                axisLabelUseCanvas: true,
                axisLabelFontSizePixels: 12,
                axisLabelFontFamily: 'Verdana, Arial',
                axisLabelPadding: 20,
            },
            legend: { noColumns: 2,show: true, container: '#legendLatencyVsRequest' },
            selection: {
                mode: 'xy'
            },
            grid: {
                hoverable: true // IMPORTANT! this is needed for tooltip to work
            },
            tooltip: true,
            tooltipOpts: {
                content: "%s : Median response time at %x req/s was %y ms"
            },
            colors: ["#9ACD32", "#FF6347"]
        };
    },
    createGraph: function () {
        var data = this.data;
        var dataset = prepareData(data.result.series, $("#choicesLatencyVsRequest"));
        var options = this.getOptions();
        prepareOptions(options, data);
        $.plot($("#flotLatenciesVsRequest"), dataset, options);
        // setup overview
        $.plot($("#overviewLatenciesVsRequest"), dataset, prepareOverviewOptions(options));
    }
};

// Latencies vs Request
function refreshLatenciesVsRequest() {
        var infos = latenciesVsRequestInfos;
        prepareSeries(infos.data);
        if(isGraph($("#flotLatenciesVsRequest"))){
            infos.createGraph();
        }else{
            var choiceContainer = $("#choicesLatencyVsRequest");
            createLegend(choiceContainer, infos);
            infos.createGraph();
            setGraphZoomable("#flotLatenciesVsRequest", "#overviewLatenciesVsRequest");
            $('#footerLatenciesVsRequest .legendColorBox > div').each(function(i){
                $(this).clone().prependTo(choiceContainer.find("li").eq(i));
            });
        }
};

var hitsPerSecondInfos = {
        data: {"result": {"minY": 2.0, "minX": 1.51549476E12, "maxY": 2.0, "series": [{"data": [[1.51549476E12, 2.0]], "isOverall": false, "label": "hitsPerSecond", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.51549476E12, "title": "Hits Per Second"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of hits / sec",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: "#legendHitsPerSecond"
                },
                selection: {
                    mode : 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s at %x was %y.2 hits/sec"
                }
            };
        },
        createGraph: function createGraph() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesHitsPerSecond"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotHitsPerSecond"), dataset, options);
            // setup overview
            $.plot($("#overviewHitsPerSecond"), dataset, prepareOverviewOptions(options));
        }
};

// Hits per second
function refreshHitsPerSecond(fixTimestamps) {
    var infos = hitsPerSecondInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 19800000);
    }
    if (isGraph($("#flotHitsPerSecond"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesHitsPerSecond");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotHitsPerSecond", "#overviewHitsPerSecond");
        $('#footerHitsPerSecond .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
}

var codesPerSecondInfos = {
        data: {"result": {"minY": 2.0, "minX": 1.51549476E12, "maxY": 2.0, "series": [{"data": [[1.51549476E12, 2.0]], "isOverall": false, "label": "200", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.51549476E12, "title": "Codes Per Second"}},
        getOptions: function(){
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of responses/sec",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: "#legendCodesPerSecond"
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "Number of Response Codes %s at %x was %y.2 responses / sec"
                }
            };
        },
    createGraph: function() {
        var data = this.data;
        var dataset = prepareData(data.result.series, $("#choicesCodesPerSecond"));
        var options = this.getOptions();
        prepareOptions(options, data);
        $.plot($("#flotCodesPerSecond"), dataset, options);
        // setup overview
        $.plot($("#overviewCodesPerSecond"), dataset, prepareOverviewOptions(options));
    }
};

// Codes per second
function refreshCodesPerSecond(fixTimestamps) {
    var infos = codesPerSecondInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 19800000);
    }
    if(isGraph($("#flotCodesPerSecond"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesCodesPerSecond");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotCodesPerSecond", "#overviewCodesPerSecond");
        $('#footerCodesPerSecond .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var transactionsPerSecondInfos = {
        data: {"result": {"minY": 2.0, "minX": 1.51549476E12, "maxY": 2.0, "series": [{"data": [[1.51549476E12, 2.0]], "isOverall": false, "label": "HTTP Request-success", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.51549476E12, "title": "Transactions Per Second"}},
        getOptions: function(){
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of transactions / sec",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: "#legendTransactionsPerSecond"
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s at %x was %y transactions / sec"
                }
            };
        },
    createGraph: function () {
        var data = this.data;
        var dataset = prepareData(data.result.series, $("#choicesTransactionsPerSecond"));
        var options = this.getOptions();
        prepareOptions(options, data);
        $.plot($("#flotTransactionsPerSecond"), dataset, options);
        // setup overview
        $.plot($("#overviewTransactionsPerSecond"), dataset, prepareOverviewOptions(options));
    }
};

// Transactions per second
function refreshTransactionsPerSecond(fixTimestamps) {
    var infos = transactionsPerSecondInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 19800000);
    }
    if(isGraph($("#flotTransactionsPerSecond"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesTransactionsPerSecond");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotTransactionsPerSecond", "#overviewTransactionsPerSecond");
        $('#footerTransactionsPerSecond .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

// Collapse the graph matching the specified DOM element depending the collapsed
// status
function collapse(elem, collapsed){
    if(collapsed){
        $(elem).parent().find(".fa-chevron-up").removeClass("fa-chevron-up").addClass("fa-chevron-down");
    } else {
        $(elem).parent().find(".fa-chevron-down").removeClass("fa-chevron-down").addClass("fa-chevron-up");
        if (elem.id == "bodyBytesThroughputOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshBytesThroughputOverTime(true);
            }
            document.location.href="#bytesThroughputOverTime";
        } else if (elem.id == "bodyLatenciesOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshLatenciesOverTime(true);
            }
            document.location.href="#latenciesOverTime";
        } else if (elem.id == "bodyConnectTimeOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshConnectTimeOverTime(true);
            }
            document.location.href="#connectTimeOverTime";
        } else if (elem.id == "bodyResponseTimePercentilesOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshResponseTimePercentilesOverTime(true);
            }
            document.location.href="#responseTimePercentilesOverTime";
        } else if (elem.id == "bodyResponseTimeDistribution") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshResponseTimeDistribution();
            }
            document.location.href="#responseTimeDistribution" ;
        } else if (elem.id == "bodySyntheticResponseTimeDistribution") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshSyntheticResponseTimeDistribution();
            }
            document.location.href="#syntheticResponseTimeDistribution" ;
        } else if (elem.id == "bodyActiveThreadsOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshActiveThreadsOverTime(true);
            }
            document.location.href="#activeThreadsOverTime";
        } else if (elem.id == "bodyTimeVsThreads") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshTimeVsThreads();
            }
            document.location.href="#timeVsThreads" ;
        } else if (elem.id == "bodyCodesPerSecond") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshCodesPerSecond(true);
            }
            document.location.href="#codesPerSecond";
        } else if (elem.id == "bodyTransactionsPerSecond") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshTransactionsPerSecond(true);
            }
            document.location.href="#transactionsPerSecond";
        } else if (elem.id == "bodyResponseTimeVsRequest") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshResponseTimeVsRequest();
            }
            document.location.href="#responseTimeVsRequest";
        } else if (elem.id == "bodyLatenciesVsRequest") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshLatenciesVsRequest();
            }
            document.location.href="#latencyVsRequest";
        }
    }
}

// Collapse
$(function() {
        $('.collapse').on('shown.bs.collapse', function(){
            collapse(this, false);
        }).on('hidden.bs.collapse', function(){
            collapse(this, true);
        });
});

$(function() {
    $(".glyphicon").mousedown( function(event){
        var tmp = $('.in:not(ul)');
        tmp.parent().parent().parent().find(".fa-chevron-up").removeClass("fa-chevron-down").addClass("fa-chevron-down");
        tmp.removeClass("in");
        tmp.addClass("out");
    });
});

/*
 * Activates or deactivates all series of the specified graph (represented by id parameter)
 * depending on checked argument.
 */
function toggleAll(id, checked){
    var placeholder = document.getElementById(id);

    var cases = $(placeholder).find(':checkbox');
    cases.prop('checked', checked);
    $(cases).parent().children().children().toggleClass("legend-disabled", !checked);

    var choiceContainer;
    if ( id == "choicesBytesThroughputOverTime"){
        choiceContainer = $("#choicesBytesThroughputOverTime");
        refreshBytesThroughputOverTime(false);
    } else if(id == "choicesResponseTimesOverTime"){
        choiceContainer = $("#choicesResponseTimesOverTime");
        refreshResponseTimeOverTime(false);
    } else if ( id == "choicesLatenciesOverTime"){
        choiceContainer = $("#choicesLatenciesOverTime");
        refreshLatenciesOverTime(false);
    } else if ( id == "choicesConnectTimeOverTime"){
        choiceContainer = $("#choicesConnectTimeOverTime");
        refreshConnectTimeOverTime(false);
    } else if ( id == "responseTimePercentilesOverTime"){
        choiceContainer = $("#choicesResponseTimePercentilesOverTime");
        refreshResponseTimePercentilesOverTime(false);
    } else if ( id == "choicesResponseTimePercentiles"){
        choiceContainer = $("#choicesResponseTimePercentiles");
        refreshResponseTimePercentiles();
    } else if(id == "choicesActiveThreadsOverTime"){
        choiceContainer = $("#choicesActiveThreadsOverTime");
        refreshActiveThreadsOverTime(false);
    } else if ( id == "choicesTimeVsThreads"){
        choiceContainer = $("#choicesTimeVsThreads");
        refreshTimeVsThreads();
    } else if ( id == "choicesSyntheticResponseTimeDistribution"){
        choiceContainer = $("#choicesSyntheticResponseTimeDistribution");
        refreshSyntheticResponseTimeDistribution();
    } else if ( id == "choicesResponseTimeDistribution"){
        choiceContainer = $("#choicesResponseTimeDistribution");
        refreshResponseTimeDistribution();
    } else if ( id == "choicesHitsPerSecond"){
        choiceContainer = $("#choicesHitsPerSecond");
        refreshHitsPerSecond(false);
    } else if(id == "choicesCodesPerSecond"){
        choiceContainer = $("#choicesCodesPerSecond");
        refreshCodesPerSecond(false);
    } else if ( id == "choicesTransactionsPerSecond"){
        choiceContainer = $("#choicesTransactionsPerSecond");
        refreshTransactionsPerSecond(false);
    } else if ( id == "choicesResponseTimeVsRequest"){
        choiceContainer = $("#choicesResponseTimeVsRequest");
        refreshResponseTimeVsRequest();
    } else if ( id == "choicesLatencyVsRequest"){
        choiceContainer = $("#choicesLatencyVsRequest");
        refreshLatenciesVsRequest();
    }
    var color = checked ? "black" : "#818181";
    choiceContainer.find("label").each(function(){
        this.style.color = color;
    });
}

// Unchecks all boxes for "Hide all samples" functionality
function uncheckAll(id){
    toggleAll(id, false);
}

// Checks all boxes for "Show all samples" functionality
function checkAll(id){
    toggleAll(id, true);
}

// Prepares data to be consumed by plot plugins
function prepareData(series, choiceContainer, customizeSeries){
    var datasets = [];

    // Add only selected series to the data set
    choiceContainer.find("input:checked").each(function (index, item) {
        var key = $(item).attr("name");
        var i = 0;
        var size = series.length;
        while(i < size && series[i].label != key)
            i++;
        if(i < size){
            var currentSeries = series[i];
            datasets.push(currentSeries);
            if(customizeSeries)
                customizeSeries(currentSeries);
        }
    });
    return datasets;
}

/*
 * Ignore case comparator
 */
function sortAlphaCaseless(a,b){
    return a.toLowerCase() > b.toLowerCase() ? 1 : -1;
};

/*
 * Creates a legend in the specified element with graph information
 */
function createLegend(choiceContainer, infos) {
    // Sort series by name
    var keys = [];
    $.each(infos.data.result.series, function(index, series){
        keys.push(series.label);
    });
    keys.sort(sortAlphaCaseless);

    // Create list of series with support of activation/deactivation
    $.each(keys, function(index, key) {
        var id = choiceContainer.attr('id') + index;
        $('<li />')
            .append($('<input id="' + id + '" name="' + key + '" type="checkbox" checked="checked" hidden />'))
            .append($('<label />', { 'text': key , 'for': id }))
            .appendTo(choiceContainer);
    });
    choiceContainer.find("label").click( function(){
        if (this.style.color !== "rgb(129, 129, 129)" ){
            this.style.color="#818181";
        }else {
            this.style.color="black";
        }
        $(this).parent().children().children().toggleClass("legend-disabled");
    });
    choiceContainer.find("label").mousedown( function(event){
        event.preventDefault();
    });
    choiceContainer.find("label").mouseenter(function(){
        this.style.cursor="pointer";
    });

    // Recreate graphe on series activation toggle
    choiceContainer.find("input").click(function(){
        infos.createGraph();
    });
}
