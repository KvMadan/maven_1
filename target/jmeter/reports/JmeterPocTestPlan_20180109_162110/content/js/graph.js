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
        data: {"result": {"minY": 6.0, "minX": 0.0, "maxY": 16363.0, "series": [{"data": [[0.0, 6.0], [0.1, 7.0], [0.2, 7.0], [0.3, 7.0], [0.4, 7.0], [0.5, 7.0], [0.6, 7.0], [0.7, 7.0], [0.8, 8.0], [0.9, 8.0], [1.0, 8.0], [1.1, 8.0], [1.2, 8.0], [1.3, 9.0], [1.4, 9.0], [1.5, 9.0], [1.6, 9.0], [1.7, 10.0], [1.8, 10.0], [1.9, 10.0], [2.0, 10.0], [2.1, 10.0], [2.2, 10.0], [2.3, 11.0], [2.4, 11.0], [2.5, 11.0], [2.6, 11.0], [2.7, 11.0], [2.8, 11.0], [2.9, 12.0], [3.0, 12.0], [3.1, 12.0], [3.2, 12.0], [3.3, 12.0], [3.4, 13.0], [3.5, 13.0], [3.6, 14.0], [3.7, 14.0], [3.8, 15.0], [3.9, 15.0], [4.0, 17.0], [4.1, 17.0], [4.2, 18.0], [4.3, 19.0], [4.4, 21.0], [4.5, 70.0], [4.6, 71.0], [4.7, 78.0], [4.8, 80.0], [4.9, 81.0], [5.0, 83.0], [5.1, 88.0], [5.2, 88.0], [5.3, 100.0], [5.4, 102.0], [5.5, 103.0], [5.6, 112.0], [5.7, 113.0], [5.8, 116.0], [5.9, 116.0], [6.0, 117.0], [6.1, 121.0], [6.2, 122.0], [6.3, 134.0], [6.4, 138.0], [6.5, 141.0], [6.6, 142.0], [6.7, 150.0], [6.8, 162.0], [6.9, 163.0], [7.0, 165.0], [7.1, 169.0], [7.2, 169.0], [7.3, 172.0], [7.4, 172.0], [7.5, 174.0], [7.6, 174.0], [7.7, 174.0], [7.8, 175.0], [7.9, 177.0], [8.0, 179.0], [8.1, 179.0], [8.2, 179.0], [8.3, 179.0], [8.4, 184.0], [8.5, 184.0], [8.6, 185.0], [8.7, 185.0], [8.8, 187.0], [8.9, 190.0], [9.0, 194.0], [9.1, 195.0], [9.2, 195.0], [9.3, 196.0], [9.4, 196.0], [9.5, 197.0], [9.6, 202.0], [9.7, 204.0], [9.8, 210.0], [9.9, 219.0], [10.0, 228.0], [10.1, 232.0], [10.2, 235.0], [10.3, 235.0], [10.4, 240.0], [10.5, 241.0], [10.6, 244.0], [10.7, 248.0], [10.8, 249.0], [10.9, 257.0], [11.0, 258.0], [11.1, 260.0], [11.2, 261.0], [11.3, 268.0], [11.4, 269.0], [11.5, 271.0], [11.6, 272.0], [11.7, 272.0], [11.8, 276.0], [11.9, 279.0], [12.0, 280.0], [12.1, 287.0], [12.2, 298.0], [12.3, 307.0], [12.4, 330.0], [12.5, 350.0], [12.6, 355.0], [12.7, 366.0], [12.8, 376.0], [12.9, 924.0], [13.0, 946.0], [13.1, 950.0], [13.2, 953.0], [13.3, 975.0], [13.4, 985.0], [13.5, 1078.0], [13.6, 1314.0], [13.7, 1426.0], [13.8, 1437.0], [13.9, 1446.0], [14.0, 1463.0], [14.1, 1464.0], [14.2, 1492.0], [14.3, 1499.0], [14.4, 1534.0], [14.5, 1538.0], [14.6, 1590.0], [14.7, 1621.0], [14.8, 1631.0], [14.9, 1674.0], [15.0, 1701.0], [15.1, 1812.0], [15.2, 1834.0], [15.3, 1849.0], [15.4, 1856.0], [15.5, 1857.0], [15.6, 1926.0], [15.7, 1964.0], [15.8, 1966.0], [15.9, 2040.0], [16.0, 2051.0], [16.1, 2063.0], [16.2, 2084.0], [16.3, 2106.0], [16.4, 2106.0], [16.5, 2113.0], [16.6, 2123.0], [16.7, 2126.0], [16.8, 2146.0], [16.9, 2172.0], [17.0, 2207.0], [17.1, 2252.0], [17.2, 2261.0], [17.3, 2293.0], [17.4, 2377.0], [17.5, 2380.0], [17.6, 2402.0], [17.7, 2410.0], [17.8, 2412.0], [17.9, 2433.0], [18.0, 2434.0], [18.1, 2452.0], [18.2, 2459.0], [18.3, 2464.0], [18.4, 2466.0], [18.5, 2478.0], [18.6, 2480.0], [18.7, 2484.0], [18.8, 2486.0], [18.9, 2488.0], [19.0, 2536.0], [19.1, 2540.0], [19.2, 2546.0], [19.3, 2546.0], [19.4, 2558.0], [19.5, 2563.0], [19.6, 2573.0], [19.7, 2574.0], [19.8, 2589.0], [19.9, 2630.0], [20.0, 2632.0], [20.1, 2635.0], [20.2, 2656.0], [20.3, 2662.0], [20.4, 2663.0], [20.5, 2671.0], [20.6, 2680.0], [20.7, 2687.0], [20.8, 2701.0], [20.9, 2712.0], [21.0, 2736.0], [21.1, 2740.0], [21.2, 2742.0], [21.3, 2746.0], [21.4, 2752.0], [21.5, 2767.0], [21.6, 2769.0], [21.7, 2770.0], [21.8, 2771.0], [21.9, 2771.0], [22.0, 2774.0], [22.1, 2778.0], [22.2, 2780.0], [22.3, 2781.0], [22.4, 2783.0], [22.5, 2783.0], [22.6, 2783.0], [22.7, 2792.0], [22.8, 2801.0], [22.9, 2804.0], [23.0, 2809.0], [23.1, 2817.0], [23.2, 2822.0], [23.3, 2824.0], [23.4, 2829.0], [23.5, 2851.0], [23.6, 2859.0], [23.7, 2862.0], [23.8, 2870.0], [23.9, 2896.0], [24.0, 2898.0], [24.1, 2908.0], [24.2, 2909.0], [24.3, 2922.0], [24.4, 2934.0], [24.5, 2939.0], [24.6, 2954.0], [24.7, 2954.0], [24.8, 2957.0], [24.9, 2982.0], [25.0, 2987.0], [25.1, 2995.0], [25.2, 3015.0], [25.3, 3022.0], [25.4, 3026.0], [25.5, 3026.0], [25.6, 3028.0], [25.7, 3030.0], [25.8, 3035.0], [25.9, 3038.0], [26.0, 3040.0], [26.1, 3048.0], [26.2, 3062.0], [26.3, 3075.0], [26.4, 3076.0], [26.5, 3080.0], [26.6, 3089.0], [26.7, 3106.0], [26.8, 3121.0], [26.9, 3153.0], [27.0, 3153.0], [27.1, 3157.0], [27.2, 3159.0], [27.3, 3162.0], [27.4, 3167.0], [27.5, 3169.0], [27.6, 3172.0], [27.7, 3174.0], [27.8, 3177.0], [27.9, 3180.0], [28.0, 3196.0], [28.1, 3207.0], [28.2, 3212.0], [28.3, 3213.0], [28.4, 3222.0], [28.5, 3232.0], [28.6, 3246.0], [28.7, 3251.0], [28.8, 3277.0], [28.9, 3281.0], [29.0, 3305.0], [29.1, 3318.0], [29.2, 3328.0], [29.3, 3329.0], [29.4, 3332.0], [29.5, 3353.0], [29.6, 3355.0], [29.7, 3382.0], [29.8, 3383.0], [29.9, 3388.0], [30.0, 3395.0], [30.1, 3398.0], [30.2, 3414.0], [30.3, 3414.0], [30.4, 3428.0], [30.5, 3436.0], [30.6, 3460.0], [30.7, 3466.0], [30.8, 3496.0], [30.9, 3498.0], [31.0, 3530.0], [31.1, 3531.0], [31.2, 3531.0], [31.3, 3535.0], [31.4, 3549.0], [31.5, 3574.0], [31.6, 3583.0], [31.7, 3590.0], [31.8, 3612.0], [31.9, 3624.0], [32.0, 3637.0], [32.1, 3648.0], [32.2, 3656.0], [32.3, 3662.0], [32.4, 3666.0], [32.5, 3690.0], [32.6, 3701.0], [32.7, 3712.0], [32.8, 3719.0], [32.9, 3721.0], [33.0, 3754.0], [33.1, 3760.0], [33.2, 3783.0], [33.3, 3784.0], [33.4, 3802.0], [33.5, 3814.0], [33.6, 3830.0], [33.7, 3833.0], [33.8, 3843.0], [33.9, 3848.0], [34.0, 3853.0], [34.1, 3889.0], [34.2, 3911.0], [34.3, 3914.0], [34.4, 3930.0], [34.5, 3933.0], [34.6, 3937.0], [34.7, 3943.0], [34.8, 3945.0], [34.9, 3954.0], [35.0, 3959.0], [35.1, 3960.0], [35.2, 3976.0], [35.3, 3988.0], [35.4, 4033.0], [35.5, 4034.0], [35.6, 4039.0], [35.7, 4039.0], [35.8, 4068.0], [35.9, 4069.0], [36.0, 4072.0], [36.1, 4089.0], [36.2, 4092.0], [36.3, 4097.0], [36.4, 4101.0], [36.5, 4103.0], [36.6, 4105.0], [36.7, 4108.0], [36.8, 4147.0], [36.9, 4155.0], [37.0, 4176.0], [37.1, 4178.0], [37.2, 4181.0], [37.3, 4185.0], [37.4, 4194.0], [37.5, 4201.0], [37.6, 4205.0], [37.7, 4214.0], [37.8, 4215.0], [37.9, 4216.0], [38.0, 4226.0], [38.1, 4233.0], [38.2, 4236.0], [38.3, 4238.0], [38.4, 4241.0], [38.5, 4242.0], [38.6, 4243.0], [38.7, 4244.0], [38.8, 4245.0], [38.9, 4258.0], [39.0, 4271.0], [39.1, 4272.0], [39.2, 4277.0], [39.3, 4279.0], [39.4, 4285.0], [39.5, 4286.0], [39.6, 4290.0], [39.7, 4297.0], [39.8, 4302.0], [39.9, 4305.0], [40.0, 4307.0], [40.1, 4310.0], [40.2, 4310.0], [40.3, 4311.0], [40.4, 4323.0], [40.5, 4330.0], [40.6, 4338.0], [40.7, 4338.0], [40.8, 4339.0], [40.9, 4340.0], [41.0, 4347.0], [41.1, 4350.0], [41.2, 4352.0], [41.3, 4353.0], [41.4, 4360.0], [41.5, 4361.0], [41.6, 4361.0], [41.7, 4362.0], [41.8, 4364.0], [41.9, 4369.0], [42.0, 4369.0], [42.1, 4372.0], [42.2, 4386.0], [42.3, 4387.0], [42.4, 4392.0], [42.5, 4400.0], [42.6, 4403.0], [42.7, 4406.0], [42.8, 4409.0], [42.9, 4414.0], [43.0, 4417.0], [43.1, 4430.0], [43.2, 4430.0], [43.3, 4432.0], [43.4, 4443.0], [43.5, 4451.0], [43.6, 4461.0], [43.7, 4466.0], [43.8, 4515.0], [43.9, 4517.0], [44.0, 4525.0], [44.1, 4601.0], [44.2, 4717.0], [44.3, 4718.0], [44.4, 4745.0], [44.5, 4891.0], [44.6, 4924.0], [44.7, 5048.0], [44.8, 5108.0], [44.9, 5117.0], [45.0, 5132.0], [45.1, 5167.0], [45.2, 5203.0], [45.3, 5229.0], [45.4, 5233.0], [45.5, 5235.0], [45.6, 5244.0], [45.7, 5248.0], [45.8, 5257.0], [45.9, 5260.0], [46.0, 5266.0], [46.1, 5277.0], [46.2, 5284.0], [46.3, 5288.0], [46.4, 5314.0], [46.5, 5320.0], [46.6, 5322.0], [46.7, 5326.0], [46.8, 5346.0], [46.9, 5365.0], [47.0, 5371.0], [47.1, 5372.0], [47.2, 5374.0], [47.3, 5402.0], [47.4, 5412.0], [47.5, 5420.0], [47.6, 5420.0], [47.7, 5426.0], [47.8, 5433.0], [47.9, 5439.0], [48.0, 5453.0], [48.1, 5463.0], [48.2, 5464.0], [48.3, 5468.0], [48.4, 5477.0], [48.5, 5479.0], [48.6, 5483.0], [48.7, 5491.0], [48.8, 5502.0], [48.9, 5507.0], [49.0, 5508.0], [49.1, 5510.0], [49.2, 5518.0], [49.3, 5532.0], [49.4, 5535.0], [49.5, 5535.0], [49.6, 5539.0], [49.7, 5539.0], [49.8, 5550.0], [49.9, 5551.0], [50.0, 5565.0], [50.1, 5621.0], [50.2, 5665.0], [50.3, 5692.0], [50.4, 5736.0], [50.5, 5806.0], [50.6, 5807.0], [50.7, 5813.0], [50.8, 5837.0], [50.9, 5870.0], [51.0, 5872.0], [51.1, 5890.0], [51.2, 5891.0], [51.3, 5900.0], [51.4, 5974.0], [51.5, 5989.0], [51.6, 6007.0], [51.7, 6017.0], [51.8, 6026.0], [51.9, 6032.0], [52.0, 6051.0], [52.1, 6062.0], [52.2, 6073.0], [52.3, 6314.0], [52.4, 6988.0], [52.5, 7034.0], [52.6, 7051.0], [52.7, 7066.0], [52.8, 7069.0], [52.9, 7085.0], [53.0, 7094.0], [53.1, 7118.0], [53.2, 7124.0], [53.3, 7131.0], [53.4, 7152.0], [53.5, 7165.0], [53.6, 7166.0], [53.7, 7193.0], [53.8, 7225.0], [53.9, 7231.0], [54.0, 7232.0], [54.1, 7243.0], [54.2, 7259.0], [54.3, 7263.0], [54.4, 7297.0], [54.5, 7320.0], [54.6, 7341.0], [54.7, 7399.0], [54.8, 7433.0], [54.9, 7448.0], [55.0, 7464.0], [55.1, 7470.0], [55.2, 7482.0], [55.3, 7483.0], [55.4, 7493.0], [55.5, 7520.0], [55.6, 7526.0], [55.7, 7527.0], [55.8, 7584.0], [55.9, 7611.0], [56.0, 7648.0], [56.1, 7652.0], [56.2, 7660.0], [56.3, 7690.0], [56.4, 7703.0], [56.5, 7724.0], [56.6, 7738.0], [56.7, 7746.0], [56.8, 7934.0], [56.9, 8123.0], [57.0, 8153.0], [57.1, 8158.0], [57.2, 8160.0], [57.3, 8182.0], [57.4, 8189.0], [57.5, 8200.0], [57.6, 8218.0], [57.7, 8233.0], [57.8, 8243.0], [57.9, 8248.0], [58.0, 8252.0], [58.1, 8263.0], [58.2, 8264.0], [58.3, 8272.0], [58.4, 8277.0], [58.5, 8282.0], [58.6, 8302.0], [58.7, 8303.0], [58.8, 8304.0], [58.9, 8305.0], [59.0, 8308.0], [59.1, 8311.0], [59.2, 8313.0], [59.3, 8321.0], [59.4, 8322.0], [59.5, 8327.0], [59.6, 8333.0], [59.7, 8333.0], [59.8, 8340.0], [59.9, 8347.0], [60.0, 8352.0], [60.1, 8357.0], [60.2, 8357.0], [60.3, 8357.0], [60.4, 8366.0], [60.5, 8367.0], [60.6, 8368.0], [60.7, 8369.0], [60.8, 8370.0], [60.9, 8380.0], [61.0, 8381.0], [61.1, 8382.0], [61.2, 8394.0], [61.3, 8398.0], [61.4, 8403.0], [61.5, 8408.0], [61.6, 8408.0], [61.7, 8418.0], [61.8, 8424.0], [61.9, 8427.0], [62.0, 8427.0], [62.1, 8430.0], [62.2, 8431.0], [62.3, 8432.0], [62.4, 8437.0], [62.5, 8440.0], [62.6, 8443.0], [62.7, 8444.0], [62.8, 8446.0], [62.9, 8458.0], [63.0, 8459.0], [63.1, 8474.0], [63.2, 8481.0], [63.3, 8490.0], [63.4, 8490.0], [63.5, 8493.0], [63.6, 8501.0], [63.7, 8505.0], [63.8, 8509.0], [63.9, 8518.0], [64.0, 8521.0], [64.1, 8526.0], [64.2, 8526.0], [64.3, 8540.0], [64.4, 8550.0], [64.5, 8551.0], [64.6, 8552.0], [64.7, 8569.0], [64.8, 8573.0], [64.9, 8584.0], [65.0, 8597.0], [65.1, 8609.0], [65.2, 8616.0], [65.3, 8617.0], [65.4, 8618.0], [65.5, 8629.0], [65.6, 8641.0], [65.7, 8641.0], [65.8, 8646.0], [65.9, 8652.0], [66.0, 8666.0], [66.1, 8667.0], [66.2, 8669.0], [66.3, 8669.0], [66.4, 8703.0], [66.5, 8716.0], [66.6, 8717.0], [66.7, 8737.0], [66.8, 8740.0], [66.9, 8749.0], [67.0, 8752.0], [67.1, 8764.0], [67.2, 8774.0], [67.3, 8776.0], [67.4, 8778.0], [67.5, 8801.0], [67.6, 8806.0], [67.7, 8819.0], [67.8, 8820.0], [67.9, 8825.0], [68.0, 8844.0], [68.1, 8846.0], [68.2, 8875.0], [68.3, 8892.0], [68.4, 8896.0], [68.5, 8897.0], [68.6, 8898.0], [68.7, 8907.0], [68.8, 8942.0], [68.9, 8944.0], [69.0, 8951.0], [69.1, 8952.0], [69.2, 8993.0], [69.3, 9041.0], [69.4, 9056.0], [69.5, 9057.0], [69.6, 9063.0], [69.7, 9068.0], [69.8, 9070.0], [69.9, 9075.0], [70.0, 9086.0], [70.1, 9092.0], [70.2, 9094.0], [70.3, 9095.0], [70.4, 9117.0], [70.5, 9125.0], [70.6, 9139.0], [70.7, 9144.0], [70.8, 9147.0], [70.9, 9149.0], [71.0, 9153.0], [71.1, 9158.0], [71.2, 9159.0], [71.3, 9162.0], [71.4, 9167.0], [71.5, 9182.0], [71.6, 9196.0], [71.7, 9203.0], [71.8, 9204.0], [71.9, 9206.0], [72.0, 9207.0], [72.1, 9221.0], [72.2, 9234.0], [72.3, 9235.0], [72.4, 9238.0], [72.5, 9243.0], [72.6, 9253.0], [72.7, 9266.0], [72.8, 9279.0], [72.9, 9294.0], [73.0, 9299.0], [73.1, 9330.0], [73.2, 9340.0], [73.3, 9361.0], [73.4, 9367.0], [73.5, 9368.0], [73.6, 9369.0], [73.7, 9370.0], [73.8, 9376.0], [73.9, 9382.0], [74.0, 9393.0], [74.1, 9453.0], [74.2, 9459.0], [74.3, 9485.0], [74.4, 9502.0], [74.5, 9505.0], [74.6, 9507.0], [74.7, 9512.0], [74.8, 9513.0], [74.9, 9520.0], [75.0, 9524.0], [75.1, 9530.0], [75.2, 9541.0], [75.3, 9547.0], [75.4, 9558.0], [75.5, 9573.0], [75.6, 9575.0], [75.7, 9587.0], [75.8, 9593.0], [75.9, 9593.0], [76.0, 9598.0], [76.1, 9614.0], [76.2, 9623.0], [76.3, 9624.0], [76.4, 9633.0], [76.5, 9641.0], [76.6, 9646.0], [76.7, 9669.0], [76.8, 9670.0], [76.9, 9674.0], [77.0, 9727.0], [77.1, 9729.0], [77.2, 9732.0], [77.3, 9733.0], [77.4, 9736.0], [77.5, 9736.0], [77.6, 9740.0], [77.7, 9751.0], [77.8, 9752.0], [77.9, 9757.0], [78.0, 9758.0], [78.1, 9762.0], [78.2, 9765.0], [78.3, 9771.0], [78.4, 9787.0], [78.5, 9794.0], [78.6, 9796.0], [78.7, 9799.0], [78.8, 9816.0], [78.9, 9818.0], [79.0, 9821.0], [79.1, 9834.0], [79.2, 9839.0], [79.3, 9839.0], [79.4, 9853.0], [79.5, 9862.0], [79.6, 9863.0], [79.7, 9865.0], [79.8, 9866.0], [79.9, 9868.0], [80.0, 9868.0], [80.1, 9873.0], [80.2, 9873.0], [80.3, 9874.0], [80.4, 9931.0], [80.5, 9953.0], [80.6, 10010.0], [80.7, 10076.0], [80.8, 10091.0], [80.9, 10099.0], [81.0, 10127.0], [81.1, 10194.0], [81.2, 10208.0], [81.3, 10210.0], [81.4, 10222.0], [81.5, 10229.0], [81.6, 10267.0], [81.7, 10279.0], [81.8, 10292.0], [81.9, 10292.0], [82.0, 10299.0], [82.1, 10328.0], [82.2, 10610.0], [82.3, 10619.0], [82.4, 10642.0], [82.5, 10660.0], [82.6, 10670.0], [82.7, 10679.0], [82.8, 10706.0], [82.9, 10711.0], [83.0, 10713.0], [83.1, 10728.0], [83.2, 10732.0], [83.3, 10775.0], [83.4, 10783.0], [83.5, 10787.0], [83.6, 10791.0], [83.7, 10794.0], [83.8, 10884.0], [83.9, 10894.0], [84.0, 10921.0], [84.1, 10923.0], [84.2, 10924.0], [84.3, 10927.0], [84.4, 10929.0], [84.5, 10950.0], [84.6, 11010.0], [84.7, 11018.0], [84.8, 11023.0], [84.9, 11124.0], [85.0, 11133.0], [85.1, 11235.0], [85.2, 11321.0], [85.3, 11430.0], [85.4, 11518.0], [85.5, 11630.0], [85.6, 11652.0], [85.7, 11725.0], [85.8, 11782.0], [85.9, 11788.0], [86.0, 11812.0], [86.1, 11955.0], [86.2, 12050.0], [86.3, 12067.0], [86.4, 12274.0], [86.5, 12294.0], [86.6, 12321.0], [86.7, 12377.0], [86.8, 12440.0], [86.9, 12477.0], [87.0, 12574.0], [87.1, 12584.0], [87.2, 12603.0], [87.3, 12609.0], [87.4, 12614.0], [87.5, 12618.0], [87.6, 12626.0], [87.7, 12633.0], [87.8, 12638.0], [87.9, 12650.0], [88.0, 12665.0], [88.1, 12669.0], [88.2, 12681.0], [88.3, 12687.0], [88.4, 12698.0], [88.5, 12702.0], [88.6, 12706.0], [88.7, 12709.0], [88.8, 12710.0], [88.9, 12719.0], [89.0, 12726.0], [89.1, 12728.0], [89.2, 12732.0], [89.3, 12738.0], [89.4, 12746.0], [89.5, 12754.0], [89.6, 12756.0], [89.7, 12765.0], [89.8, 12765.0], [89.9, 12769.0], [90.0, 12781.0], [90.1, 12782.0], [90.2, 12783.0], [90.3, 12785.0], [90.4, 12789.0], [90.5, 12792.0], [90.6, 12796.0], [90.7, 12798.0], [90.8, 12799.0], [90.9, 12802.0], [91.0, 12806.0], [91.1, 12814.0], [91.2, 12817.0], [91.3, 12828.0], [91.4, 12833.0], [91.5, 12835.0], [91.6, 12835.0], [91.7, 12844.0], [91.8, 12847.0], [91.9, 12848.0], [92.0, 12856.0], [92.1, 12857.0], [92.2, 12864.0], [92.3, 12864.0], [92.4, 12868.0], [92.5, 12879.0], [92.6, 12888.0], [92.7, 12909.0], [92.8, 12916.0], [92.9, 12939.0], [93.0, 12939.0], [93.1, 12949.0], [93.2, 12971.0], [93.3, 13037.0], [93.4, 13047.0], [93.5, 13063.0], [93.6, 13086.0], [93.7, 13087.0], [93.8, 13095.0], [93.9, 13107.0], [94.0, 13125.0], [94.1, 13139.0], [94.2, 13153.0], [94.3, 13172.0], [94.4, 13180.0], [94.5, 13212.0], [94.6, 13227.0], [94.7, 13266.0], [94.8, 13383.0], [94.9, 13397.0], [95.0, 13408.0], [95.1, 13426.0], [95.2, 13436.0], [95.3, 13443.0], [95.4, 13448.0], [95.5, 13461.0], [95.6, 13477.0], [95.7, 13479.0], [95.8, 13484.0], [95.9, 13502.0], [96.0, 13510.0], [96.1, 13522.0], [96.2, 13535.0], [96.3, 13546.0], [96.4, 13551.0], [96.5, 13553.0], [96.6, 13553.0], [96.7, 13564.0], [96.8, 13582.0], [96.9, 13585.0], [97.0, 13585.0], [97.1, 13587.0], [97.2, 13591.0], [97.3, 13600.0], [97.4, 13603.0], [97.5, 13606.0], [97.6, 13608.0], [97.7, 13614.0], [97.8, 13619.0], [97.9, 13626.0], [98.0, 13633.0], [98.1, 13645.0], [98.2, 13648.0], [98.3, 13652.0], [98.4, 13654.0], [98.5, 13655.0], [98.6, 13658.0], [98.7, 13660.0], [98.8, 13660.0], [98.9, 13679.0], [99.0, 13687.0], [99.1, 13689.0], [99.2, 13713.0], [99.3, 13714.0], [99.4, 13746.0], [99.5, 13771.0], [99.6, 13848.0], [99.7, 13870.0], [99.8, 13871.0], [99.9, 13985.0], [100.0, 16363.0]], "isOverall": false, "label": "HTTP Request", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 100.0, "title": "Response Time Percentiles"}},
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
        data: {"result": {"minY": 1.0, "minX": 0.0, "maxY": 152.0, "series": [{"data": [[0.0, 152.0], [8500.0, 67.0], [9000.0, 61.0], [9500.0, 73.0], [10000.0, 18.0], [10500.0, 29.0], [11000.0, 9.0], [11500.0, 10.0], [12000.0, 9.0], [12500.0, 75.0], [13000.0, 30.0], [13500.0, 48.0], [1000.0, 10.0], [16000.0, 1.0], [1500.0, 18.0], [2000.0, 36.0], [2500.0, 73.0], [3000.0, 69.0], [3500.0, 52.0], [4000.0, 99.0], [4500.0, 11.0], [5000.0, 48.0], [5500.0, 33.0], [6000.0, 9.0], [6500.0, 1.0], [7000.0, 36.0], [7500.0, 16.0], [500.0, 7.0], [8000.0, 79.0]], "isOverall": false, "label": "HTTP Request", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 500, "maxX": 16000.0, "title": "Response Time Distribution"}},
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
        data: {"result": {"minY": 17.0, "minX": 1.0, "ticks": [[0, "Requests having \nresponse time <= 500ms"], [1, "Requests having \nresponse time > 500ms and <= 1,500ms"], [2, "Requests having \nresponse time > 1,500ms"], [3, "Requests in error"]], "maxY": 1010.0, "series": [{"data": [[1.0, 17.0]], "isOverall": false, "label": "Requests having \nresponse time > 500ms and <= 1,500ms", "isController": false}, {"data": [[3.0, 152.0]], "isOverall": false, "label": "Requests in error", "isController": false}, {"data": [[2.0, 1010.0]], "isOverall": false, "label": "Requests having \nresponse time > 1,500ms", "isController": false}], "supportsControllersDiscrimination": false, "maxX": 3.0, "title": "Synthetic Response Times Distribution"}},
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
        data: {"result": {"minY": 581.6861747243423, "minX": 1.51549506E12, "maxY": 581.6861747243423, "series": [{"data": [[1.51549506E12, 581.6861747243423]], "isOverall": false, "label": "Thread Group", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.51549506E12, "title": "Active Threads Over Time"}},
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
        data: {"result": {"minY": 9.0, "minX": 1.0, "maxY": 16363.0, "series": [{"data": [[2.0, 13714.0], [3.0, 13759.0], [4.0, 13679.0], [5.0, 13666.0], [6.0, 13645.0], [7.0, 13985.0], [8.0, 13648.0], [9.0, 13746.0], [10.0, 13771.0], [11.0, 13585.0], [12.0, 13713.0], [13.0, 13654.0], [14.0, 13655.0], [15.0, 13652.0], [16.0, 13687.0], [17.0, 13546.0], [18.0, 13603.0], [19.0, 13689.0], [20.0, 13585.0], [21.0, 13591.0], [22.0, 13614.0], [23.0, 13587.0], [24.0, 13553.0], [25.0, 13600.0], [26.0, 13618.0], [27.0, 13564.0], [28.0, 13535.0], [29.0, 13626.0], [30.0, 13633.0], [31.0, 13475.0], [33.0, 13608.0], [32.0, 13619.0], [35.0, 13502.0], [34.0, 13553.0], [37.0, 13436.0], [36.0, 13426.0], [39.0, 13556.0], [38.0, 13405.0], [41.0, 13510.0], [40.0, 13511.0], [43.0, 13484.0], [42.0, 13870.0], [45.0, 13448.0], [44.0, 13848.0], [47.0, 13658.0], [46.0, 13461.0], [49.0, 13397.0], [48.0, 13871.0], [51.0, 11942.0], [50.0, 12050.0], [53.0, 13660.0], [52.0, 12067.0], [55.0, 13606.0], [54.0, 13227.0], [57.0, 13198.0], [56.0, 12888.0], [59.0, 13180.0], [58.0, 13212.0], [61.0, 13660.0], [60.0, 13172.0], [63.0, 13654.0], [62.0, 12844.0], [67.0, 13443.0], [66.0, 13153.0], [65.0, 12817.0], [64.0, 13551.0], [71.0, 11955.0], [70.0, 12939.0], [69.0, 12848.0], [68.0, 12856.0], [75.0, 12915.0], [74.0, 13383.0], [73.0, 13139.0], [72.0, 12847.0], [79.0, 12860.0], [78.0, 12781.0], [77.0, 12811.0], [76.0, 12828.0], [83.0, 12909.0], [82.0, 12792.0], [81.0, 12833.0], [80.0, 12864.0], [87.0, 12782.0], [86.0, 12868.0], [85.0, 12916.0], [84.0, 12879.0], [91.0, 12783.0], [90.0, 12857.0], [89.0, 12835.0], [88.0, 13522.0], [95.0, 12777.0], [94.0, 12798.0], [93.0, 13598.0], [92.0, 12864.0], [99.0, 12765.0], [98.0, 12793.0], [97.0, 12785.0], [96.0, 13582.0], [103.0, 12796.0], [102.0, 12754.0], [101.0, 13095.0], [100.0, 12738.0], [107.0, 12697.5], [105.0, 12614.0], [104.0, 13037.0], [111.0, 12716.0], [110.0, 12743.0], [109.0, 12698.0], [108.0, 13477.0], [115.0, 12732.0], [114.0, 12709.0], [113.0, 12728.0], [112.0, 12719.0], [119.0, 12746.0], [118.0, 12799.0], [117.0, 12802.0], [116.0, 11788.0], [123.0, 12708.0], [121.0, 13479.0], [120.0, 12687.0], [127.0, 12681.0], [126.0, 12683.0], [125.0, 12971.0], [124.0, 11812.0], [135.0, 12702.0], [134.0, 12650.0], [133.0, 12618.0], [132.0, 12603.0], [131.0, 13408.0], [130.0, 12949.0], [129.0, 12756.0], [128.0, 12843.0], [143.0, 12609.0], [142.0, 12939.0], [141.0, 11782.0], [140.0, 12574.0], [139.0, 12636.0], [138.0, 12626.0], [137.0, 12394.0], [151.0, 12765.0], [150.0, 13047.0], [149.0, 12814.0], [148.0, 12665.0], [147.0, 13107.0], [146.0, 12638.0], [145.0, 12835.0], [144.0, 13266.0], [159.0, 13125.0], [158.0, 12440.0], [157.0, 12769.0], [156.0, 11652.0], [155.0, 12789.0], [154.0, 12596.0], [153.0, 11551.0], [152.0, 12806.0], [167.0, 13086.0], [166.0, 12274.0], [165.0, 13087.0], [164.0, 12633.0], [163.0, 11430.0], [162.0, 11518.0], [161.0, 13101.0], [160.0, 12477.0], [175.0, 11133.0], [174.0, 12377.0], [173.0, 11235.0], [172.0, 12983.0], [171.0, 11321.0], [170.0, 12302.0], [169.0, 12294.0], [168.0, 12584.0], [183.0, 10950.0], [182.0, 11010.0], [181.0, 11018.0], [180.0, 11124.0], [179.0, 11630.0], [178.0, 11023.0], [177.0, 12321.0], [176.0, 11125.0], [191.0, 10884.0], [190.0, 10924.0], [189.0, 10894.0], [188.0, 10927.0], [187.0, 10923.0], [186.0, 10921.0], [185.0, 10929.0], [184.0, 10927.0], [199.0, 9037.0], [198.0, 9125.0], [197.0, 9152.0], [196.0, 9086.0], [195.0, 9056.0], [194.0, 9063.0], [193.0, 9072.0], [192.0, 10876.0], [207.0, 8737.0], [206.0, 8846.0], [205.0, 10127.0], [204.0, 8944.0], [203.0, 8898.0], [202.0, 8951.0], [201.0, 9041.0], [200.0, 9075.0], [215.0, 10545.0], [214.0, 10791.0], [213.0, 10099.0], [212.0, 8752.0], [211.0, 8749.0], [210.0, 10328.0], [209.0, 8819.0], [208.0, 8897.0], [223.0, 10292.0], [222.0, 9159.0], [221.0, 10713.0], [220.0, 8716.0], [219.0, 9520.5], [217.0, 10794.0], [216.0, 8704.0], [231.0, 9092.0], [230.0, 8764.0], [229.0, 10299.0], [228.0, 8901.0], [226.0, 10728.0], [225.0, 10787.0], [224.0, 8717.0], [239.0, 10279.0], [238.0, 10292.0], [237.0, 10775.0], [236.0, 10783.0], [235.0, 8616.0], [234.0, 9144.0], [233.0, 9095.0], [232.0, 8778.0], [247.0, 10194.0], [246.0, 8641.0], [245.0, 10249.0], [244.0, 10741.0], [243.0, 9158.0], [242.0, 8609.0], [241.0, 8764.0], [240.0, 9107.0], [255.0, 10208.0], [254.0, 8666.0], [253.0, 8617.0], [252.0, 9068.0], [251.0, 10711.0], [250.0, 8703.0], [249.0, 10229.0], [248.0, 10732.0], [270.0, 10619.0], [271.0, 8526.0], [269.0, 10642.0], [268.0, 8629.0], [267.0, 8667.0], [266.0, 10660.0], [265.0, 8844.0], [264.0, 10673.0], [263.0, 10610.0], [257.0, 10706.0], [256.0, 8641.0], [259.0, 10210.0], [258.0, 8669.0], [262.0, 10679.0], [261.0, 10670.0], [260.0, 8859.0], [286.0, 8378.0], [287.0, 8367.0], [285.0, 9951.0], [284.0, 8319.0], [283.0, 8381.0], [282.0, 9953.0], [281.0, 8458.0], [280.0, 8526.0], [279.0, 10010.0], [273.0, 8929.0], [272.0, 8993.0], [275.0, 10091.0], [274.0, 8481.0], [278.0, 10076.0], [277.0, 8740.0], [276.0, 8540.0], [302.0, 9751.0], [303.0, 8189.0], [301.0, 10222.0], [300.0, 8584.0], [299.0, 8987.5], [297.0, 9794.0], [296.0, 9821.0], [295.0, 8158.0], [289.0, 8370.0], [288.0, 10131.0], [291.0, 8302.0], [290.0, 9853.0], [294.0, 8272.0], [293.0, 8282.0], [292.0, 8305.0], [318.0, 8263.0], [319.0, 9931.0], [317.0, 8182.0], [316.0, 9512.0], [315.0, 8203.0], [314.0, 9547.0], [313.0, 8243.0], [312.0, 9593.0], [311.0, 9868.0], [305.0, 9736.0], [304.0, 8160.0], [307.0, 8313.0], [306.0, 8352.0], [310.0, 9614.0], [309.0, 9593.0], [308.0, 9646.0], [334.0, 8233.0], [335.0, 9765.0], [333.0, 9863.0], [332.0, 9368.0], [331.0, 9868.0], [330.0, 9865.0], [329.0, 9866.0], [328.0, 9816.0], [327.0, 9874.0], [321.0, 9453.0], [320.0, 9839.0], [323.0, 9839.0], [322.0, 9624.0], [326.0, 9873.0], [325.0, 9382.0], [324.0, 9873.0], [350.0, 9370.0], [351.0, 9799.0], [349.0, 9367.0], [348.0, 8264.0], [347.0, 9834.0], [346.0, 9340.0], [345.0, 9787.0], [344.0, 9796.0], [343.0, 9771.0], [337.0, 9630.5], [339.0, 8263.0], [338.0, 9361.0], [342.0, 9854.0], [340.0, 9818.0], [366.0, 9727.0], [367.0, 8123.0], [365.0, 9258.0], [364.0, 9766.0], [363.0, 9253.0], [362.0, 9751.0], [361.0, 9762.0], [360.0, 9337.0], [359.0, 9299.0], [353.0, 9371.0], [352.0, 9369.0], [355.0, 9733.0], [354.0, 9376.0], [358.0, 9804.0], [357.0, 8200.0], [356.0, 9736.0], [382.0, 8952.0], [383.0, 9633.0], [381.0, 9234.0], [380.0, 9729.0], [379.0, 9670.0], [378.0, 9243.0], [377.0, 9727.0], [376.0, 9732.0], [375.0, 8153.0], [369.0, 9221.0], [368.0, 8126.0], [371.0, 9758.0], [370.0, 9294.0], [374.0, 9740.0], [373.0, 9752.0], [372.0, 9238.0], [398.0, 8907.0], [399.0, 8896.0], [397.0, 9162.0], [396.0, 9279.0], [395.0, 9674.0], [394.0, 9235.0], [393.0, 9203.0], [392.0, 9598.0], [391.0, 8942.0], [385.0, 9207.0], [384.0, 9204.0], [387.0, 9266.0], [386.0, 9669.0], [390.0, 9187.0], [389.0, 9206.0], [388.0, 9167.0], [414.0, 9513.0], [415.0, 9213.0], [413.0, 9593.0], [412.0, 9117.0], [411.0, 9505.0], [410.0, 9139.0], [409.0, 9330.0], [408.0, 9196.0], [407.0, 9623.0], [401.0, 9153.0], [400.0, 9182.0], [403.0, 8875.0], [402.0, 8892.0], [406.0, 9644.0], [405.0, 9573.0], [404.0, 9641.0], [430.0, 8776.0], [431.0, 9530.0], [429.0, 9345.0], [428.0, 9459.0], [426.0, 9524.0], [425.0, 9558.0], [424.0, 8801.0], [423.0, 9566.0], [417.0, 9094.0], [416.0, 9587.0], [419.0, 8820.0], [418.0, 8806.0], [422.0, 9575.0], [421.0, 8825.0], [420.0, 9070.0], [446.0, 7606.0], [447.0, 8597.0], [445.0, 7703.0], [444.0, 7738.0], [443.0, 8577.0], [442.0, 7520.0], [441.0, 7746.0], [440.0, 8652.0], [439.0, 8669.0], [433.0, 9507.0], [432.0, 9520.0], [435.0, 9518.0], [434.0, 9498.0], [438.0, 9485.0], [437.0, 9057.0], [436.0, 9502.0], [462.0, 8110.5], [463.0, 8440.0], [460.0, 8551.0], [451.0, 8474.0], [450.0, 7724.0], [449.0, 7708.0], [448.0, 8459.0], [459.0, 7690.0], [458.0, 8535.5], [456.0, 7448.0], [455.0, 7464.0], [454.0, 8490.0], [453.0, 7297.0], [452.0, 8509.0], [478.0, 7414.0], [479.0, 8424.0], [477.0, 8505.0], [476.0, 8418.0], [475.0, 8474.0], [474.0, 7433.0], [473.0, 8552.0], [472.0, 8539.0], [471.0, 7231.0], [465.0, 8490.0], [464.0, 8805.0], [467.0, 7246.0], [466.0, 8501.0], [470.0, 8427.0], [469.0, 8444.0], [468.0, 7648.0], [494.0, 8399.0], [495.0, 8404.0], [492.0, 8503.0], [483.0, 8493.0], [482.0, 8432.0], [481.0, 7660.0], [480.0, 8394.0], [491.0, 7263.0], [490.0, 8437.0], [489.0, 8443.0], [488.0, 8518.0], [487.0, 8428.0], [486.0, 7526.0], [485.0, 8427.0], [484.0, 8446.0], [510.0, 7783.5], [511.0, 7243.0], [508.0, 8431.0], [499.0, 7611.0], [498.0, 8357.0], [497.0, 8441.0], [496.0, 8369.0], [507.0, 8327.0], [506.0, 8408.0], [505.0, 7584.0], [504.0, 7225.0], [503.0, 8333.0], [502.0, 8380.0], [501.0, 8403.0], [500.0, 8340.0], [540.0, 7934.0], [543.0, 7166.0], [529.0, 8573.0], [528.0, 8408.0], [531.0, 8248.0], [530.0, 8335.0], [533.0, 8618.0], [532.0, 8277.0], [542.0, 7069.0], [541.0, 7131.0], [539.0, 8303.0], [538.0, 7482.0], [537.0, 7152.0], [536.0, 8617.0], [527.0, 8322.0], [512.0, 8366.0], [514.0, 8333.0], [513.0, 7527.0], [517.0, 8329.0], [515.0, 8398.0], [519.0, 8646.0], [518.0, 8363.0], [526.0, 8357.0], [525.0, 8252.0], [524.0, 8382.0], [523.0, 8321.0], [522.0, 7193.0], [521.0, 8357.0], [520.0, 7191.0], [535.0, 7399.0], [534.0, 8302.0], [572.0, 4705.0], [575.0, 4461.0], [561.0, 7051.0], [560.0, 6988.0], [563.0, 5890.0], [562.0, 7034.0], [565.0, 5372.0], [564.0, 5891.0], [574.0, 4430.0], [573.0, 4460.0], [571.0, 4515.0], [570.0, 4517.0], [569.0, 4718.0], [568.0, 4717.0], [559.0, 7049.0], [545.0, 7493.0], [544.0, 8304.0], [547.0, 7470.0], [546.0, 7102.0], [549.0, 7124.0], [548.0, 7483.0], [551.0, 7483.0], [550.0, 7118.0], [558.0, 7066.0], [557.0, 7094.0], [556.0, 7320.0], [555.0, 7232.0], [554.0, 7085.0], [553.0, 7341.0], [552.0, 7165.0], [567.0, 4745.0], [566.0, 6314.0], [604.0, 4361.0], [607.0, 4338.0], [593.0, 4387.0], [592.0, 4350.0], [595.0, 4364.0], [594.0, 5420.0], [597.0, 4330.0], [596.0, 4372.0], [606.0, 4338.0], [605.0, 4386.0], [603.0, 4360.0], [602.0, 4233.0], [601.0, 5468.0], [600.0, 4358.0], [591.0, 5507.0], [577.0, 4425.0], [576.0, 4466.0], [579.0, 4451.0], [578.0, 5488.0], [581.0, 4406.0], [580.0, 4369.0], [583.0, 5532.0], [582.0, 4361.0], [590.0, 4338.0], [588.0, 4369.0], [587.0, 4432.0], [586.0, 5535.0], [585.0, 4392.0], [584.0, 4362.0], [599.0, 4396.0], [598.0, 4400.0], [636.0, 4443.0], [639.0, 4216.0], [625.0, 4241.0], [624.0, 4286.0], [627.0, 4244.0], [626.0, 4271.0], [629.0, 6073.0], [628.0, 4214.0], [638.0, 5539.0], [637.0, 5547.0], [635.0, 6034.0], [634.0, 4238.0], [633.0, 6051.0], [632.0, 4216.0], [623.0, 4258.0], [608.0, 4347.0], [610.0, 4305.0], [609.0, 4310.0], [612.0, 4525.0], [611.0, 4290.0], [615.0, 4870.5], [613.0, 4340.0], [622.0, 4290.0], [621.0, 4311.0], [620.0, 4279.0], [619.0, 4243.0], [618.0, 5416.0], [617.0, 4307.0], [616.0, 4297.0], [631.0, 6062.0], [630.0, 5565.0], [665.0, 5260.0], [670.0, 4103.0], [671.0, 5989.0], [656.0, 4285.0], [658.0, 5510.0], [657.0, 5167.0], [660.0, 4155.0], [659.0, 5491.0], [669.0, 5483.0], [668.0, 4930.5], [666.0, 5479.0], [664.0, 4681.5], [647.0, 5235.0], [646.0, 5233.0], [645.0, 4153.0], [644.0, 5550.0], [643.0, 5517.0], [642.0, 6032.0], [641.0, 5535.0], [640.0, 3954.0], [655.0, 3971.0], [654.0, 6007.0], [653.0, 4310.0], [652.0, 5518.0], [651.0, 6017.0], [650.0, 6026.0], [649.0, 4181.0], [648.0, 5203.0], [662.0, 4072.0], [661.0, 5508.0], [700.0, 5813.0], [676.0, 3061.0], [681.0, 1949.4], [680.0, 3943.0], [683.0, 5453.0], [682.0, 4243.0], [685.0, 5248.0], [684.0, 5464.0], [687.0, 5117.0], [673.0, 4101.0], [672.0, 5439.0], [686.0, 5412.0], [677.0, 985.0], [679.0, 5260.0], [678.0, 4639.0], [697.0, 5477.0], [696.0, 4983.0], [699.0, 5837.0], [698.0, 5870.0], [675.0, 3216.5], [674.0, 3270.5], [703.0, 5900.0], [688.0, 3940.0], [690.0, 5108.0], [689.0, 3959.0], [692.0, 5930.0], [691.0, 4039.0], [694.0, 3976.0], [693.0, 5426.0], [702.0, 5433.0], [701.0, 5692.0], [733.0, 3843.0], [707.0, 2612.5], [719.0, 2899.5], [704.0, 5371.0], [706.0, 4201.0], [705.0, 5665.0], [718.0, 5320.0], [717.0, 5346.0], [716.0, 3719.0], [715.0, 4068.0], [714.0, 4194.0], [713.0, 5374.0], [712.0, 4039.0], [724.0, 3498.0], [723.0, 5621.0], [722.0, 4097.0], [721.0, 5314.0], [720.0, 5365.0], [725.0, 4215.0], [727.0, 5736.0], [726.0, 3833.0], [735.0, 4033.0], [734.0, 5288.0], [732.0, 4108.0], [731.0, 5420.0], [730.0, 5806.0], [729.0, 5807.0], [728.0, 5370.0], [711.0, 3760.0], [710.0, 5872.0], [709.0, 3848.0], [708.0, 5048.0], [764.0, 2050.3333333333335], [750.0, 3464.0], [749.0, 3618.0], [748.0, 3666.0], [747.0, 4891.0], [746.0, 5244.0], [745.0, 3914.0], [744.0, 5306.0], [751.0, 4972.0], [737.0, 5257.0], [736.0, 5539.0], [739.0, 5284.0], [738.0, 5669.0], [741.0, 3945.0], [740.0, 5266.0], [743.0, 5277.0], [742.0, 4924.0], [757.0, 2370.0], [759.0, 2982.0], [758.0, 2995.0], [760.0, 2212.0], [766.0, 2334.0], [765.0, 2199.0], [763.0, 2219.5], [762.0, 2466.5], [761.0, 2408.0], [767.0, 2957.0], [752.0, 5326.0], [754.0, 3229.0], [753.0, 3329.0], [756.0, 3062.0], [755.0, 3121.0], [793.0, 4034.0], [797.0, 2740.0], [787.0, 2158.0], [786.0, 2862.0], [785.0, 2937.0], [789.0, 2743.0], [788.0, 2806.0], [791.0, 2792.0], [790.0, 2770.0], [798.0, 2137.0], [799.0, 2097.0], [796.0, 2781.0], [795.0, 2769.0], [794.0, 2954.0], [792.0, 2767.0], [775.0, 3075.0], [774.0, 2774.0], [773.0, 2870.0], [772.0, 2901.0], [771.0, 2851.0], [770.0, 3146.0], [769.0, 2939.0], [768.0, 3153.0], [783.0, 2771.0], [782.0, 2780.0], [781.0, 2822.0], [780.0, 2922.0], [779.0, 4601.0], [778.0, 2770.0], [777.0, 2908.0], [776.0, 3030.0], [828.0, 4092.0], [810.0, 2271.5], [809.0, 3937.0], [808.0, 2671.0], [812.0, 2031.0], [813.0, 4089.0], [815.0, 4430.0], [800.0, 2778.0], [803.0, 2903.0], [801.0, 3988.0], [805.0, 4417.0], [804.0, 2063.0], [807.0, 4352.0], [806.0, 3960.0], [814.0, 3930.0], [825.0, 2630.0], [824.0, 3887.0], [811.0, 2259.5], [831.0, 3822.0], [817.0, 2674.0], [819.0, 3933.0], [818.0, 4409.0], [821.0, 2632.0], [820.0, 4403.0], [823.0, 3624.0], [822.0, 4414.0], [830.0, 4069.0], [829.0, 4338.0], [827.0, 3853.0], [826.0, 4369.0], [858.0, 3353.0], [862.0, 4185.0], [838.0, 2798.0], [837.0, 4277.0], [836.0, 4302.0], [835.0, 4236.0], [834.0, 3814.0], [833.0, 4226.0], [832.0, 3830.0], [839.0, 3436.0], [847.0, 3754.0], [846.0, 4242.0], [845.0, 4245.0], [844.0, 3802.0], [843.0, 3428.0], [842.0, 3496.0], [841.0, 4272.0], [840.0, 4277.0], [857.0, 3377.0], [856.0, 3712.0], [849.0, 2666.5], [855.0, 2676.0], [854.0, 3383.0], [853.0, 4194.0], [852.0, 3783.0], [851.0, 3690.0], [850.0, 3530.0], [863.0, 3677.0], [848.0, 3701.0], [861.0, 3414.0], [860.0, 3382.0], [859.0, 4205.0], [892.0, 3612.0], [864.0, 2696.0], [865.0, 4105.0], [867.0, 3328.0], [866.0, 4176.0], [869.0, 2540.0], [868.0, 2566.0], [871.0, 3637.0], [870.0, 3889.0], [879.0, 3414.0], [878.0, 3182.0], [877.0, 3222.0], [876.0, 3531.0], [875.0, 3574.0], [874.0, 3281.0], [873.0, 3310.0], [872.0, 3590.0], [887.0, 2813.0], [886.0, 3164.0], [885.0, 3196.0], [884.0, 3162.0], [883.0, 3177.0], [882.0, 3028.0], [881.0, 3305.0], [880.0, 3355.0], [894.0, 3207.0], [893.0, 3251.0], [891.0, 3395.0], [890.0, 3648.0], [889.0, 3656.0], [888.0, 3153.0], [924.0, 3159.0], [927.0, 3030.0], [913.0, 3318.0], [912.0, 3332.0], [915.0, 3246.0], [914.0, 2898.0], [917.0, 3106.0], [916.0, 2834.0], [926.0, 2783.0], [925.0, 3157.0], [923.0, 2954.0], [922.0, 3080.0], [921.0, 3167.0], [920.0, 3174.0], [911.0, 3398.0], [897.0, 3180.0], [896.0, 3329.5], [899.0, 3169.0], [898.0, 3531.0], [901.0, 3460.0], [900.0, 3549.0], [903.0, 3477.0], [902.0, 3535.0], [910.0, 3009.0], [909.0, 3398.0], [908.0, 3022.0], [907.0, 3026.0], [906.0, 3388.0], [905.0, 3498.0], [904.0, 3533.0], [919.0, 3172.0], [918.0, 3073.0], [952.0, 2486.0], [957.0, 2484.0], [958.0, 2824.0], [945.0, 2558.0], [944.0, 2896.0], [947.0, 2804.0], [946.0, 2574.0], [956.0, 2520.0], [955.0, 2746.0], [954.0, 2632.5], [943.0, 2536.0], [928.0, 2783.0], [931.0, 3089.0], [930.0, 2890.0], [933.0, 2752.0], [932.0, 3048.0], [935.0, 2680.0], [934.0, 2712.0], [942.0, 2909.0], [941.0, 2546.0], [940.0, 2546.0], [939.0, 2663.0], [938.0, 2656.0], [937.0, 2635.0], [936.0, 3026.0], [951.0, 2829.0], [950.0, 2471.0], [949.0, 2488.0], [948.0, 2478.0], [973.0, 2573.0], [983.0, 2459.0], [967.0, 2402.0], [966.0, 2421.0], [965.0, 2783.0], [964.0, 2412.0], [963.0, 2452.0], [962.0, 2809.0], [961.0, 2480.0], [960.0, 2641.5], [975.0, 2207.0], [974.0, 2563.0], [972.0, 2252.0], [971.0, 2589.0], [970.0, 2293.0], [969.0, 2380.0], [968.0, 2377.0], [1013.0, 2172.0], [1011.0, 2126.0], [1007.0, 2106.0], [1084.0, 490.4814814814814], [1080.0, 377.14285714285717], [1068.0, 2434.0], [1074.0, 1308.5], [1072.0, 94.0], [1038.0, 2123.0], [1070.0, 154.0], [1114.0, 11.666666666666666], [1110.0, 69.33333333333333], [1088.0, 13.0], [1090.0, 519.0], [1092.0, 810.0], [1112.0, 9.0], [1108.0, 184.0], [1104.0, 14.0], [1106.0, 276.0], [1102.0, 9.857142857142856], [1094.0, 136.66666666666666], [1077.0, 117.5], [1075.0, 122.28571428571428], [1043.0, 1849.0], [1041.0, 2084.0], [1081.0, 96.75], [1083.0, 261.0], [1085.0, 75.0], [1079.0, 122.33333333333334], [1073.0, 47.16666666666667], [1071.0, 147.5], [1069.0, 296.65909090909093], [1089.0, 10.0], [1093.0, 209.5], [1111.0, 193.5], [1105.0, 891.0], [1.0, 16363.0]], "isOverall": false, "label": "HTTP Request", "isController": false}, {"data": [[581.6861747243423, 6365.525869380832]], "isOverall": false, "label": "HTTP Request-Aggregated", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 1114.0, "title": "Time VS Threads"}},
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
        data : {"result": {"minY": 3098.116666666667, "minX": 1.51549506E12, "maxY": 276775.06666666665, "series": [{"data": [[1.51549506E12, 276775.06666666665]], "isOverall": false, "label": "Bytes received per second", "isController": false}, {"data": [[1.51549506E12, 3098.116666666667]], "isOverall": false, "label": "Bytes sent per second", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.51549506E12, "title": "Bytes Throughput Over Time"}},
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
        data: {"result": {"minY": 6365.525869380832, "minX": 1.51549506E12, "maxY": 6365.525869380832, "series": [{"data": [[1.51549506E12, 6365.525869380832]], "isOverall": false, "label": "HTTP Request", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.51549506E12, "title": "Response Time Over Time"}},
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
        data: {"result": {"minY": 6335.79050042409, "minX": 1.51549506E12, "maxY": 6335.79050042409, "series": [{"data": [[1.51549506E12, 6335.79050042409]], "isOverall": false, "label": "HTTP Request", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.51549506E12, "title": "Latencies Over Time"}},
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
        data: {"result": {"minY": 120.38422391857502, "minX": 1.51549506E12, "maxY": 120.38422391857502, "series": [{"data": [[1.51549506E12, 120.38422391857502]], "isOverall": false, "label": "HTTP Request", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.51549506E12, "title": "Connect Time Over Time"}},
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
        data: {"result": {"minY": 924.0, "minX": 1.51549506E12, "maxY": 16363.0, "series": [{"data": [[1.51549506E12, 16363.0]], "isOverall": false, "label": "Max", "isController": false}, {"data": [[1.51549506E12, 924.0]], "isOverall": false, "label": "Min", "isController": false}, {"data": [[1.51549506E12, 12829.0]], "isOverall": false, "label": "90th percentile", "isController": false}, {"data": [[1.51549506E12, 13706.28]], "isOverall": false, "label": "99th percentile", "isController": false}, {"data": [[1.51549506E12, 13478.2]], "isOverall": false, "label": "95th percentile", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.51549506E12, "title": "Response Time Percentiles Over Time (successful requests only)"}},
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
    data: {"result": {"minY": 139.5, "minX": 19.0, "maxY": 7708.0, "series": [{"data": [[19.0, 7708.0]], "isOverall": false, "label": "Successes", "isController": false}, {"data": [[19.0, 139.5]], "isOverall": false, "label": "Failures", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 19.0, "title": "Response Time Vs Request"}},
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
    data: {"result": {"minY": 0.0, "minX": 19.0, "maxY": 7700.0, "series": [{"data": [[19.0, 7700.0]], "isOverall": false, "label": "Successes", "isController": false}, {"data": [[19.0, 0.0]], "isOverall": false, "label": "Failures", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 19.0, "title": "Latencies Vs Request"}},
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
        data: {"result": {"minY": 19.65, "minX": 1.51549506E12, "maxY": 19.65, "series": [{"data": [[1.51549506E12, 19.65]], "isOverall": false, "label": "hitsPerSecond", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.51549506E12, "title": "Hits Per Second"}},
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
        data: {"result": {"minY": 0.5166666666666667, "minX": 1.51549506E12, "maxY": 17.116666666666667, "series": [{"data": [[1.51549506E12, 17.116666666666667]], "isOverall": false, "label": "200", "isController": false}, {"data": [[1.51549506E12, 2.0166666666666666]], "isOverall": false, "label": "Non HTTP response code: org.apache.http.NoHttpResponseException", "isController": false}, {"data": [[1.51549506E12, 0.5166666666666667]], "isOverall": false, "label": "Non HTTP response code: java.net.SocketException", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.51549506E12, "title": "Codes Per Second"}},
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
        data: {"result": {"minY": 2.533333333333333, "minX": 1.51549506E12, "maxY": 17.116666666666667, "series": [{"data": [[1.51549506E12, 17.116666666666667]], "isOverall": false, "label": "HTTP Request-success", "isController": false}, {"data": [[1.51549506E12, 2.533333333333333]], "isOverall": false, "label": "HTTP Request-failure", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.51549506E12, "title": "Transactions Per Second"}},
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
