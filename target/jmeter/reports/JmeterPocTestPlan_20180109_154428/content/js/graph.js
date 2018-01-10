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
        data: {"result": {"minY": 304.0, "minX": 0.0, "maxY": 24169.0, "series": [{"data": [[0.0, 304.0], [0.1, 317.0], [0.2, 327.0], [0.3, 330.0], [0.4, 338.0], [0.5, 340.0], [0.6, 346.0], [0.7, 350.0], [0.8, 357.0], [0.9, 360.0], [1.0, 369.0], [1.1, 377.0], [1.2, 377.0], [1.3, 386.0], [1.4, 391.0], [1.5, 408.0], [1.6, 412.0], [1.7, 426.0], [1.8, 426.0], [1.9, 430.0], [2.0, 437.0], [2.1, 439.0], [2.2, 447.0], [2.3, 452.0], [2.4, 455.0], [2.5, 458.0], [2.6, 458.0], [2.7, 464.0], [2.8, 467.0], [2.9, 472.0], [3.0, 479.0], [3.1, 494.0], [3.2, 496.0], [3.3, 515.0], [3.4, 521.0], [3.5, 541.0], [3.6, 552.0], [3.7, 562.0], [3.8, 571.0], [3.9, 586.0], [4.0, 618.0], [4.1, 622.0], [4.2, 662.0], [4.3, 703.0], [4.4, 718.0], [4.5, 803.0], [4.6, 832.0], [4.7, 862.0], [4.8, 870.0], [4.9, 897.0], [5.0, 907.0], [5.1, 931.0], [5.2, 961.0], [5.3, 982.0], [5.4, 1013.0], [5.5, 1054.0], [5.6, 1065.0], [5.7, 1073.0], [5.8, 1092.0], [5.9, 1120.0], [6.0, 1129.0], [6.1, 1143.0], [6.2, 1146.0], [6.3, 1159.0], [6.4, 1165.0], [6.5, 1188.0], [6.6, 1189.0], [6.7, 1221.0], [6.8, 1226.0], [6.9, 1233.0], [7.0, 1259.0], [7.1, 1266.0], [7.2, 1270.0], [7.3, 1283.0], [7.4, 1300.0], [7.5, 1315.0], [7.6, 1321.0], [7.7, 1337.0], [7.8, 1354.0], [7.9, 1374.0], [8.0, 1388.0], [8.1, 1403.0], [8.2, 1424.0], [8.3, 1431.0], [8.4, 1455.0], [8.5, 1468.0], [8.6, 1472.0], [8.7, 1472.0], [8.8, 1486.0], [8.9, 1490.0], [9.0, 1497.0], [9.1, 1511.0], [9.2, 1541.0], [9.3, 1549.0], [9.4, 1555.0], [9.5, 1581.0], [9.6, 1593.0], [9.7, 1624.0], [9.8, 1646.0], [9.9, 1666.0], [10.0, 1690.0], [10.1, 1723.0], [10.2, 1749.0], [10.3, 1774.0], [10.4, 1784.0], [10.5, 1817.0], [10.6, 1829.0], [10.7, 1836.0], [10.8, 1883.0], [10.9, 1909.0], [11.0, 1931.0], [11.1, 1978.0], [11.2, 1997.0], [11.3, 2041.0], [11.4, 2106.0], [11.5, 2133.0], [11.6, 2175.0], [11.7, 2208.0], [11.8, 2240.0], [11.9, 2248.0], [12.0, 2308.0], [12.1, 2322.0], [12.2, 2351.0], [12.3, 2358.0], [12.4, 2376.0], [12.5, 2379.0], [12.6, 2386.0], [12.7, 2411.0], [12.8, 2435.0], [12.9, 2441.0], [13.0, 2444.0], [13.1, 2450.0], [13.2, 2462.0], [13.3, 2471.0], [13.4, 2485.0], [13.5, 2497.0], [13.6, 2503.0], [13.7, 2509.0], [13.8, 2519.0], [13.9, 2525.0], [14.0, 2539.0], [14.1, 2543.0], [14.2, 2560.0], [14.3, 2567.0], [14.4, 2575.0], [14.5, 2580.0], [14.6, 2584.0], [14.7, 2586.0], [14.8, 2590.0], [14.9, 2592.0], [15.0, 2596.0], [15.1, 2597.0], [15.2, 2601.0], [15.3, 2603.0], [15.4, 2605.0], [15.5, 2608.0], [15.6, 2613.0], [15.7, 2616.0], [15.8, 2622.0], [15.9, 2623.0], [16.0, 2628.0], [16.1, 2636.0], [16.2, 2638.0], [16.3, 2648.0], [16.4, 2651.0], [16.5, 2654.0], [16.6, 2656.0], [16.7, 2662.0], [16.8, 2671.0], [16.9, 2673.0], [17.0, 2681.0], [17.1, 2683.0], [17.2, 2685.0], [17.3, 2689.0], [17.4, 2692.0], [17.5, 2695.0], [17.6, 2697.0], [17.7, 2700.0], [17.8, 2707.0], [17.9, 2708.0], [18.0, 2714.0], [18.1, 2728.0], [18.2, 2733.0], [18.3, 2735.0], [18.4, 2739.0], [18.5, 2742.0], [18.6, 2746.0], [18.7, 2754.0], [18.8, 2757.0], [18.9, 2758.0], [19.0, 2766.0], [19.1, 2768.0], [19.2, 2771.0], [19.3, 2776.0], [19.4, 2779.0], [19.5, 2783.0], [19.6, 2786.0], [19.7, 2790.0], [19.8, 2791.0], [19.9, 2798.0], [20.0, 2803.0], [20.1, 2803.0], [20.2, 2809.0], [20.3, 2812.0], [20.4, 2813.0], [20.5, 2816.0], [20.6, 2817.0], [20.7, 2818.0], [20.8, 2823.0], [20.9, 2828.0], [21.0, 2832.0], [21.1, 2834.0], [21.2, 2844.0], [21.3, 2849.0], [21.4, 2853.0], [21.5, 2859.0], [21.6, 2864.0], [21.7, 2865.0], [21.8, 2870.0], [21.9, 2872.0], [22.0, 2878.0], [22.1, 2881.0], [22.2, 2887.0], [22.3, 2890.0], [22.4, 2897.0], [22.5, 2900.0], [22.6, 2904.0], [22.7, 2906.0], [22.8, 2917.0], [22.9, 2918.0], [23.0, 2921.0], [23.1, 2927.0], [23.2, 2935.0], [23.3, 2938.0], [23.4, 2943.0], [23.5, 2947.0], [23.6, 2950.0], [23.7, 2954.0], [23.8, 2958.0], [23.9, 2963.0], [24.0, 2964.0], [24.1, 2966.0], [24.2, 2973.0], [24.3, 2978.0], [24.4, 2982.0], [24.5, 2984.0], [24.6, 2987.0], [24.7, 2990.0], [24.8, 2993.0], [24.9, 2994.0], [25.0, 2999.0], [25.1, 3003.0], [25.2, 3005.0], [25.3, 3008.0], [25.4, 3011.0], [25.5, 3013.0], [25.6, 3018.0], [25.7, 3023.0], [25.8, 3028.0], [25.9, 3035.0], [26.0, 3038.0], [26.1, 3040.0], [26.2, 3041.0], [26.3, 3042.0], [26.4, 3052.0], [26.5, 3056.0], [26.6, 3058.0], [26.7, 3059.0], [26.8, 3065.0], [26.9, 3067.0], [27.0, 3068.0], [27.1, 3069.0], [27.2, 3075.0], [27.3, 3077.0], [27.4, 3084.0], [27.5, 3085.0], [27.6, 3087.0], [27.7, 3092.0], [27.8, 3093.0], [27.9, 3095.0], [28.0, 3096.0], [28.1, 3099.0], [28.2, 3101.0], [28.3, 3103.0], [28.4, 3108.0], [28.5, 3109.0], [28.6, 3112.0], [28.7, 3113.0], [28.8, 3120.0], [28.9, 3123.0], [29.0, 3125.0], [29.1, 3127.0], [29.2, 3129.0], [29.3, 3131.0], [29.4, 3131.0], [29.5, 3132.0], [29.6, 3133.0], [29.7, 3133.0], [29.8, 3136.0], [29.9, 3137.0], [30.0, 3139.0], [30.1, 3141.0], [30.2, 3144.0], [30.3, 3146.0], [30.4, 3149.0], [30.5, 3152.0], [30.6, 3153.0], [30.7, 3153.0], [30.8, 3154.0], [30.9, 3156.0], [31.0, 3161.0], [31.1, 3161.0], [31.2, 3163.0], [31.3, 3166.0], [31.4, 3169.0], [31.5, 3171.0], [31.6, 3176.0], [31.7, 3178.0], [31.8, 3182.0], [31.9, 3185.0], [32.0, 3188.0], [32.1, 3190.0], [32.2, 3191.0], [32.3, 3192.0], [32.4, 3194.0], [32.5, 3195.0], [32.6, 3196.0], [32.7, 3199.0], [32.8, 3201.0], [32.9, 3203.0], [33.0, 3207.0], [33.1, 3207.0], [33.2, 3210.0], [33.3, 3210.0], [33.4, 3213.0], [33.5, 3217.0], [33.6, 3220.0], [33.7, 3221.0], [33.8, 3223.0], [33.9, 3226.0], [34.0, 3228.0], [34.1, 3230.0], [34.2, 3233.0], [34.3, 3237.0], [34.4, 3240.0], [34.5, 3243.0], [34.6, 3244.0], [34.7, 3245.0], [34.8, 3246.0], [34.9, 3247.0], [35.0, 3248.0], [35.1, 3250.0], [35.2, 3252.0], [35.3, 3256.0], [35.4, 3259.0], [35.5, 3260.0], [35.6, 3261.0], [35.7, 3262.0], [35.8, 3263.0], [35.9, 3264.0], [36.0, 3264.0], [36.1, 3266.0], [36.2, 3268.0], [36.3, 3269.0], [36.4, 3270.0], [36.5, 3272.0], [36.6, 3274.0], [36.7, 3277.0], [36.8, 3278.0], [36.9, 3280.0], [37.0, 3280.0], [37.1, 3283.0], [37.2, 3284.0], [37.3, 3284.0], [37.4, 3286.0], [37.5, 3287.0], [37.6, 3292.0], [37.7, 3292.0], [37.8, 3294.0], [37.9, 3295.0], [38.0, 3296.0], [38.1, 3300.0], [38.2, 3301.0], [38.3, 3302.0], [38.4, 3307.0], [38.5, 3309.0], [38.6, 3315.0], [38.7, 3316.0], [38.8, 3318.0], [38.9, 3320.0], [39.0, 3321.0], [39.1, 3321.0], [39.2, 3323.0], [39.3, 3324.0], [39.4, 3329.0], [39.5, 3333.0], [39.6, 3334.0], [39.7, 3335.0], [39.8, 3338.0], [39.9, 3338.0], [40.0, 3341.0], [40.1, 3341.0], [40.2, 3342.0], [40.3, 3344.0], [40.4, 3345.0], [40.5, 3346.0], [40.6, 3352.0], [40.7, 3354.0], [40.8, 3359.0], [40.9, 3360.0], [41.0, 3362.0], [41.1, 3363.0], [41.2, 3366.0], [41.3, 3368.0], [41.4, 3370.0], [41.5, 3371.0], [41.6, 3374.0], [41.7, 3374.0], [41.8, 3376.0], [41.9, 3379.0], [42.0, 3385.0], [42.1, 3385.0], [42.2, 3388.0], [42.3, 3390.0], [42.4, 3395.0], [42.5, 3397.0], [42.6, 3401.0], [42.7, 3404.0], [42.8, 3405.0], [42.9, 3411.0], [43.0, 3416.0], [43.1, 3416.0], [43.2, 3419.0], [43.3, 3420.0], [43.4, 3425.0], [43.5, 3425.0], [43.6, 3427.0], [43.7, 3428.0], [43.8, 3429.0], [43.9, 3430.0], [44.0, 3431.0], [44.1, 3433.0], [44.2, 3434.0], [44.3, 3439.0], [44.4, 3441.0], [44.5, 3446.0], [44.6, 3447.0], [44.7, 3448.0], [44.8, 3448.0], [44.9, 3450.0], [45.0, 3455.0], [45.1, 3456.0], [45.2, 3457.0], [45.3, 3459.0], [45.4, 3460.0], [45.5, 3461.0], [45.6, 3464.0], [45.7, 3466.0], [45.8, 3466.0], [45.9, 3473.0], [46.0, 3476.0], [46.1, 3477.0], [46.2, 3481.0], [46.3, 3484.0], [46.4, 3487.0], [46.5, 3489.0], [46.6, 3492.0], [46.7, 3494.0], [46.8, 3495.0], [46.9, 3498.0], [47.0, 3499.0], [47.1, 3502.0], [47.2, 3505.0], [47.3, 3505.0], [47.4, 3510.0], [47.5, 3512.0], [47.6, 3514.0], [47.7, 3517.0], [47.8, 3521.0], [47.9, 3524.0], [48.0, 3525.0], [48.1, 3527.0], [48.2, 3528.0], [48.3, 3528.0], [48.4, 3531.0], [48.5, 3532.0], [48.6, 3534.0], [48.7, 3542.0], [48.8, 3544.0], [48.9, 3545.0], [49.0, 3548.0], [49.1, 3549.0], [49.2, 3550.0], [49.3, 3552.0], [49.4, 3553.0], [49.5, 3555.0], [49.6, 3557.0], [49.7, 3559.0], [49.8, 3562.0], [49.9, 3563.0], [50.0, 3566.0], [50.1, 3568.0], [50.2, 3568.0], [50.3, 3571.0], [50.4, 3575.0], [50.5, 3576.0], [50.6, 3580.0], [50.7, 3580.0], [50.8, 3582.0], [50.9, 3585.0], [51.0, 3587.0], [51.1, 3588.0], [51.2, 3591.0], [51.3, 3593.0], [51.4, 3597.0], [51.5, 3597.0], [51.6, 3600.0], [51.7, 3601.0], [51.8, 3603.0], [51.9, 3604.0], [52.0, 3605.0], [52.1, 3607.0], [52.2, 3610.0], [52.3, 3610.0], [52.4, 3616.0], [52.5, 3618.0], [52.6, 3621.0], [52.7, 3625.0], [52.8, 3627.0], [52.9, 3629.0], [53.0, 3632.0], [53.1, 3635.0], [53.2, 3638.0], [53.3, 3639.0], [53.4, 3640.0], [53.5, 3642.0], [53.6, 3643.0], [53.7, 3645.0], [53.8, 3646.0], [53.9, 3647.0], [54.0, 3649.0], [54.1, 3652.0], [54.2, 3653.0], [54.3, 3653.0], [54.4, 3656.0], [54.5, 3656.0], [54.6, 3666.0], [54.7, 3669.0], [54.8, 3672.0], [54.9, 3673.0], [55.0, 3675.0], [55.1, 3676.0], [55.2, 3679.0], [55.3, 3679.0], [55.4, 3684.0], [55.5, 3689.0], [55.6, 3690.0], [55.7, 3693.0], [55.8, 3697.0], [55.9, 3699.0], [56.0, 3701.0], [56.1, 3702.0], [56.2, 3707.0], [56.3, 3714.0], [56.4, 3722.0], [56.5, 3723.0], [56.6, 3725.0], [56.7, 3726.0], [56.8, 3730.0], [56.9, 3732.0], [57.0, 3734.0], [57.1, 3735.0], [57.2, 3738.0], [57.3, 3739.0], [57.4, 3746.0], [57.5, 3746.0], [57.6, 3748.0], [57.7, 3751.0], [57.8, 3754.0], [57.9, 3758.0], [58.0, 3761.0], [58.1, 3762.0], [58.2, 3767.0], [58.3, 3769.0], [58.4, 3776.0], [58.5, 3781.0], [58.6, 3786.0], [58.7, 3787.0], [58.8, 3793.0], [58.9, 3794.0], [59.0, 3800.0], [59.1, 3802.0], [59.2, 3807.0], [59.3, 3811.0], [59.4, 3815.0], [59.5, 3822.0], [59.6, 3834.0], [59.7, 3837.0], [59.8, 3843.0], [59.9, 3846.0], [60.0, 3850.0], [60.1, 3851.0], [60.2, 3856.0], [60.3, 3856.0], [60.4, 3857.0], [60.5, 3863.0], [60.6, 3872.0], [60.7, 3876.0], [60.8, 3880.0], [60.9, 3880.0], [61.0, 3890.0], [61.1, 3898.0], [61.2, 3901.0], [61.3, 3906.0], [61.4, 3909.0], [61.5, 3912.0], [61.6, 3916.0], [61.7, 3918.0], [61.8, 3919.0], [61.9, 3920.0], [62.0, 3929.0], [62.1, 3932.0], [62.2, 3938.0], [62.3, 3942.0], [62.4, 3944.0], [62.5, 3948.0], [62.6, 3955.0], [62.7, 3956.0], [62.8, 3958.0], [62.9, 3960.0], [63.0, 3967.0], [63.1, 3970.0], [63.2, 3974.0], [63.3, 3977.0], [63.4, 3987.0], [63.5, 3990.0], [63.6, 3998.0], [63.7, 4006.0], [63.8, 4010.0], [63.9, 4016.0], [64.0, 4027.0], [64.1, 4031.0], [64.2, 4034.0], [64.3, 4038.0], [64.4, 4041.0], [64.5, 4044.0], [64.6, 4053.0], [64.7, 4054.0], [64.8, 4060.0], [64.9, 4060.0], [65.0, 4068.0], [65.1, 4070.0], [65.2, 4074.0], [65.3, 4084.0], [65.4, 4090.0], [65.5, 4095.0], [65.6, 4099.0], [65.7, 4108.0], [65.8, 4113.0], [65.9, 4116.0], [66.0, 4120.0], [66.1, 4120.0], [66.2, 4125.0], [66.3, 4127.0], [66.4, 4133.0], [66.5, 4135.0], [66.6, 4138.0], [66.7, 4141.0], [66.8, 4142.0], [66.9, 4143.0], [67.0, 4146.0], [67.1, 4158.0], [67.2, 4162.0], [67.3, 4168.0], [67.4, 4172.0], [67.5, 4176.0], [67.6, 4179.0], [67.7, 4185.0], [67.8, 4191.0], [67.9, 4195.0], [68.0, 4200.0], [68.1, 4204.0], [68.2, 4226.0], [68.3, 4229.0], [68.4, 4231.0], [68.5, 4234.0], [68.6, 4236.0], [68.7, 4241.0], [68.8, 4249.0], [68.9, 4250.0], [69.0, 4253.0], [69.1, 4258.0], [69.2, 4267.0], [69.3, 4269.0], [69.4, 4276.0], [69.5, 4278.0], [69.6, 4281.0], [69.7, 4282.0], [69.8, 4287.0], [69.9, 4289.0], [70.0, 4292.0], [70.1, 4300.0], [70.2, 4303.0], [70.3, 4310.0], [70.4, 4320.0], [70.5, 4322.0], [70.6, 4328.0], [70.7, 4335.0], [70.8, 4338.0], [70.9, 4339.0], [71.0, 4346.0], [71.1, 4349.0], [71.2, 4352.0], [71.3, 4354.0], [71.4, 4361.0], [71.5, 4361.0], [71.6, 4366.0], [71.7, 4369.0], [71.8, 4372.0], [71.9, 4385.0], [72.0, 4398.0], [72.1, 4399.0], [72.2, 4407.0], [72.3, 4409.0], [72.4, 4415.0], [72.5, 4418.0], [72.6, 4428.0], [72.7, 4433.0], [72.8, 4438.0], [72.9, 4442.0], [73.0, 4445.0], [73.1, 4449.0], [73.2, 4456.0], [73.3, 4461.0], [73.4, 4470.0], [73.5, 4474.0], [73.6, 4476.0], [73.7, 4479.0], [73.8, 4488.0], [73.9, 4494.0], [74.0, 4509.0], [74.1, 4514.0], [74.2, 4525.0], [74.3, 4537.0], [74.4, 4543.0], [74.5, 4546.0], [74.6, 4547.0], [74.7, 4548.0], [74.8, 4554.0], [74.9, 4562.0], [75.0, 4567.0], [75.1, 4571.0], [75.2, 4573.0], [75.3, 4593.0], [75.4, 4595.0], [75.5, 4601.0], [75.6, 4601.0], [75.7, 4612.0], [75.8, 4625.0], [75.9, 4634.0], [76.0, 4638.0], [76.1, 4641.0], [76.2, 4653.0], [76.3, 4662.0], [76.4, 4667.0], [76.5, 4672.0], [76.6, 4675.0], [76.7, 4682.0], [76.8, 4690.0], [76.9, 4702.0], [77.0, 4703.0], [77.1, 4709.0], [77.2, 4712.0], [77.3, 4721.0], [77.4, 4726.0], [77.5, 4732.0], [77.6, 4741.0], [77.7, 4745.0], [77.8, 4749.0], [77.9, 4757.0], [78.0, 4762.0], [78.1, 4766.0], [78.2, 4768.0], [78.3, 4772.0], [78.4, 4772.0], [78.5, 4782.0], [78.6, 4787.0], [78.7, 4798.0], [78.8, 4801.0], [78.9, 4805.0], [79.0, 4813.0], [79.1, 4823.0], [79.2, 4826.0], [79.3, 4834.0], [79.4, 4842.0], [79.5, 4851.0], [79.6, 4854.0], [79.7, 4859.0], [79.8, 4864.0], [79.9, 4869.0], [80.0, 4873.0], [80.1, 4893.0], [80.2, 4896.0], [80.3, 4914.0], [80.4, 4921.0], [80.5, 4929.0], [80.6, 4936.0], [80.7, 4970.0], [80.8, 4972.0], [80.9, 5001.0], [81.0, 5012.0], [81.1, 5020.0], [81.2, 5027.0], [81.3, 5033.0], [81.4, 5037.0], [81.5, 5060.0], [81.6, 5067.0], [81.7, 5080.0], [81.8, 5099.0], [81.9, 5121.0], [82.0, 5134.0], [82.1, 5144.0], [82.2, 5145.0], [82.3, 5158.0], [82.4, 5163.0], [82.5, 5183.0], [82.6, 5187.0], [82.7, 5204.0], [82.8, 5210.0], [82.9, 5230.0], [83.0, 5248.0], [83.1, 5257.0], [83.2, 5262.0], [83.3, 5286.0], [83.4, 5294.0], [83.5, 5311.0], [83.6, 5334.0], [83.7, 5351.0], [83.8, 5354.0], [83.9, 5376.0], [84.0, 5390.0], [84.1, 5405.0], [84.2, 5413.0], [84.3, 5424.0], [84.4, 5443.0], [84.5, 5475.0], [84.6, 5484.0], [84.7, 5494.0], [84.8, 5497.0], [84.9, 5501.0], [85.0, 5507.0], [85.1, 5529.0], [85.2, 5558.0], [85.3, 5579.0], [85.4, 5593.0], [85.5, 5608.0], [85.6, 5628.0], [85.7, 5656.0], [85.8, 5676.0], [85.9, 5685.0], [86.0, 5697.0], [86.1, 5705.0], [86.2, 5747.0], [86.3, 5763.0], [86.4, 5781.0], [86.5, 5823.0], [86.6, 5844.0], [86.7, 5877.0], [86.8, 5925.0], [86.9, 5934.0], [87.0, 5939.0], [87.1, 5969.0], [87.2, 5989.0], [87.3, 6033.0], [87.4, 6036.0], [87.5, 6045.0], [87.6, 6046.0], [87.7, 6093.0], [87.8, 6097.0], [87.9, 6121.0], [88.0, 6125.0], [88.1, 6149.0], [88.2, 6187.0], [88.3, 6244.0], [88.4, 6281.0], [88.5, 6307.0], [88.6, 6313.0], [88.7, 6368.0], [88.8, 6397.0], [88.9, 6481.0], [89.0, 6490.0], [89.1, 6526.0], [89.2, 6537.0], [89.3, 6577.0], [89.4, 6618.0], [89.5, 6629.0], [89.6, 6653.0], [89.7, 6662.0], [89.8, 6666.0], [89.9, 6678.0], [90.0, 6689.0], [90.1, 6715.0], [90.2, 6729.0], [90.3, 6742.0], [90.4, 6764.0], [90.5, 6776.0], [90.6, 6782.0], [90.7, 6804.0], [90.8, 6824.0], [90.9, 6852.0], [91.0, 6862.0], [91.1, 6904.0], [91.2, 6910.0], [91.3, 6919.0], [91.4, 6936.0], [91.5, 6953.0], [91.6, 6968.0], [91.7, 6977.0], [91.8, 6992.0], [91.9, 7008.0], [92.0, 7020.0], [92.1, 7039.0], [92.2, 7055.0], [92.3, 7069.0], [92.4, 7073.0], [92.5, 7077.0], [92.6, 7084.0], [92.7, 7110.0], [92.8, 7114.0], [92.9, 7142.0], [93.0, 7167.0], [93.1, 7197.0], [93.2, 7234.0], [93.3, 7243.0], [93.4, 7246.0], [93.5, 7283.0], [93.6, 7319.0], [93.7, 7568.0], [93.8, 7587.0], [93.9, 7631.0], [94.0, 7639.0], [94.1, 7669.0], [94.2, 7686.0], [94.3, 7843.0], [94.4, 7870.0], [94.5, 7929.0], [94.6, 8065.0], [94.7, 8310.0], [94.8, 8371.0], [94.9, 8452.0], [95.0, 8525.0], [95.1, 8782.0], [95.2, 8998.0], [95.3, 9233.0], [95.4, 9324.0], [95.5, 9435.0], [95.6, 9465.0], [95.7, 9509.0], [95.8, 9594.0], [95.9, 9614.0], [96.0, 9647.0], [96.1, 9674.0], [96.2, 9697.0], [96.3, 9706.0], [96.4, 9739.0], [96.5, 9798.0], [96.6, 9842.0], [96.7, 9880.0], [96.8, 9918.0], [96.9, 9968.0], [97.0, 9994.0], [97.1, 10016.0], [97.2, 10028.0], [97.3, 10076.0], [97.4, 10084.0], [97.5, 10096.0], [97.6, 10098.0], [97.7, 10115.0], [97.8, 10127.0], [97.9, 10175.0], [98.0, 10356.0], [98.1, 10476.0], [98.2, 11212.0], [98.3, 11473.0], [98.4, 11792.0], [98.5, 11902.0], [98.6, 12145.0], [98.7, 13203.0], [98.8, 13494.0], [98.9, 13631.0], [99.0, 13696.0], [99.1, 14343.0], [99.2, 14382.0], [99.3, 16023.0], [99.4, 16193.0], [99.5, 17608.0], [99.6, 18317.0], [99.7, 19115.0], [99.8, 23621.0], [99.9, 23834.0], [100.0, 24169.0]], "isOverall": false, "label": "HTTP Request", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 100.0, "title": "Response Time Percentiles"}},
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
        data: {"result": {"minY": 1.0, "minX": 0.0, "maxY": 550.0, "series": [{"data": [[0.0, 81.0], [8500.0, 6.0], [9000.0, 11.0], [9500.0, 35.0], [10000.0, 27.0], [10500.0, 1.0], [11000.0, 4.0], [11500.0, 5.0], [12000.0, 3.0], [12500.0, 1.0], [13000.0, 3.0], [13500.0, 7.0], [14000.0, 3.0], [15000.0, 1.0], [15500.0, 1.0], [1000.0, 92.0], [16000.0, 4.0], [17500.0, 2.0], [18000.0, 2.0], [18500.0, 2.0], [19000.0, 2.0], [23500.0, 5.0], [1500.0, 55.0], [24000.0, 1.0], [2000.0, 58.0], [2500.0, 287.0], [3000.0, 550.0], [3500.0, 416.0], [4000.0, 258.0], [4500.0, 172.0], [5000.0, 100.0], [5500.0, 58.0], [6000.0, 46.0], [6500.0, 70.0], [7000.0, 46.0], [7500.0, 21.0], [500.0, 53.0], [8000.0, 11.0]], "isOverall": false, "label": "HTTP Request", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 500, "maxX": 24000.0, "title": "Response Time Distribution"}},
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
        data: {"result": {"minY": 81.0, "minX": 0.0, "ticks": [[0, "Requests having \nresponse time <= 500ms"], [1, "Requests having \nresponse time > 500ms and <= 1,500ms"], [2, "Requests having \nresponse time > 1,500ms"], [3, "Requests in error"]], "maxY": 2274.0, "series": [{"data": [[1.0, 145.0]], "isOverall": false, "label": "Requests having \nresponse time > 500ms and <= 1,500ms", "isController": false}, {"data": [[0.0, 81.0]], "isOverall": false, "label": "Requests having \nresponse time <= 500ms", "isController": false}, {"data": [[2.0, 2274.0]], "isOverall": false, "label": "Requests having \nresponse time > 1,500ms", "isController": false}], "supportsControllersDiscrimination": false, "maxX": 2.0, "title": "Synthetic Response Times Distribution"}},
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
        data: {"result": {"minY": 42.42657342657342, "minX": 1.51549284E12, "maxY": 417.7938056851925, "series": [{"data": [[1.51549284E12, 417.7938056851925], [1.5154929E12, 42.42657342657342]], "isOverall": false, "label": "Thread Group", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.5154929E12, "title": "Active Threads Over Time"}},
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
        data: {"result": {"minY": 320.5, "minX": 1.0, "maxY": 16334.307692307695, "series": [{"data": [[2.0, 870.0], [3.0, 863.0], [4.0, 829.0], [5.0, 878.5], [6.0, 911.0], [7.0, 931.0], [8.0, 346.0], [9.0, 521.0], [10.0, 961.0], [11.0, 938.0], [12.0, 455.2], [13.0, 426.0], [14.0, 320.5], [15.0, 413.5], [16.0, 475.5], [17.0, 456.125], [18.0, 383.0], [19.0, 671.0], [20.0, 400.0], [21.0, 408.0], [22.0, 1394.5], [23.0, 384.0], [24.0, 1656.0], [25.0, 1584.0], [26.0, 1266.0], [27.0, 1571.0], [31.0, 1374.0], [33.0, 1430.2727272727273], [35.0, 1505.0], [34.0, 386.0], [37.0, 1476.0], [36.0, 1445.0], [39.0, 1207.75], [38.0, 962.5], [41.0, 1354.0], [40.0, 904.0], [43.0, 1430.0], [42.0, 328.0], [45.0, 426.0], [44.0, 1779.0], [47.0, 437.0], [46.0, 1905.0], [49.0, 1283.0], [48.0, 1379.0], [51.0, 1338.0], [50.0, 1265.3333333333333], [53.0, 1823.0], [52.0, 405.0], [55.0, 1358.0], [54.0, 1188.0], [57.0, 1541.0], [56.0, 1321.0], [59.0, 1479.2], [58.0, 1243.0], [61.0, 1431.0], [60.0, 1723.0], [63.0, 1666.0], [62.0, 1513.5], [67.0, 1749.0], [66.0, 1285.5], [65.0, 1207.5], [64.0, 1555.0], [71.0, 1321.0], [70.0, 1771.0], [69.0, 1233.0], [68.0, 1739.0], [75.0, 1302.0], [74.0, 1226.3333333333333], [73.0, 1424.0], [72.0, 1370.5], [79.0, 1690.0], [78.0, 12665.0], [77.0, 1449.0], [76.0, 1472.0], [83.0, 1315.0], [82.0, 1206.0], [81.0, 1297.0], [80.0, 1270.0], [87.0, 1120.0], [86.0, 1165.0], [85.0, 1470.0], [84.0, 1208.0], [91.0, 4335.0], [90.0, 4720.0], [89.0, 16334.307692307695], [88.0, 1072.0], [95.0, 5072.5], [94.0, 4259.666666666667], [93.0, 9544.0], [92.0, 4844.0], [99.0, 5200.0], [98.0, 3952.0], [97.0, 5229.5], [96.0, 7334.5], [103.0, 3873.0], [102.0, 5747.333333333333], [101.0, 3176.0], [100.0, 2776.0], [107.0, 3647.0], [106.0, 5067.0], [105.0, 4826.0], [104.0, 4606.0], [111.0, 3944.0], [110.0, 3436.5], [109.0, 3532.0], [108.0, 3045.0], [115.0, 4801.0], [114.0, 4352.0], [113.0, 4851.0], [112.0, 2803.0], [119.0, 4562.0], [118.0, 3422.0], [117.0, 4129.0], [116.0, 3856.0], [123.0, 4020.0], [122.0, 3142.5], [121.0, 4844.0], [120.0, 2673.0], [127.0, 4896.0], [126.0, 3246.0], [125.0, 4660.5], [124.0, 3219.5], [135.0, 2744.0], [134.0, 4416.0], [133.0, 3128.0], [132.0, 3433.0], [131.0, 4346.5], [130.0, 4603.666666666667], [129.0, 7758.5], [128.0, 4995.0], [143.0, 4817.0], [142.0, 4728.0], [141.0, 3809.5], [140.0, 4293.5], [139.0, 4281.0], [138.0, 4164.666666666667], [137.0, 4317.0], [136.0, 3917.0], [151.0, 3262.3333333333335], [149.0, 4270.0], [148.0, 3516.0], [147.0, 3850.0], [146.0, 4428.0], [145.0, 8567.5], [144.0, 5969.0], [159.0, 3908.0], [158.0, 3194.0], [157.0, 4038.6666666666665], [156.0, 4677.5], [155.0, 6006.0], [154.0, 6458.0], [153.0, 10461.0], [152.0, 3539.0], [167.0, 4127.0], [166.0, 3401.0], [165.0, 3262.0], [164.0, 4455.0], [163.0, 5037.0], [162.0, 5001.0], [161.0, 4587.0], [160.0, 3793.0], [175.0, 3292.0], [174.0, 4520.0], [173.0, 4897.5], [172.0, 2311.0], [171.0, 2405.0], [170.0, 3108.0], [169.0, 4669.0], [168.0, 4143.0], [183.0, 3453.3333333333335], [182.0, 2667.0], [181.0, 3967.0], [180.0, 4438.0], [179.0, 4896.0], [178.0, 6818.0], [177.0, 4003.3333333333335], [176.0, 9020.0], [191.0, 2827.5], [190.0, 3886.1666666666665], [189.0, 3333.0], [188.0, 5811.5], [187.0, 4338.0], [186.0, 3475.3333333333335], [185.0, 3244.0], [184.0, 4852.0], [199.0, 10113.5], [198.0, 9417.75], [197.0, 2440.0], [196.0, 2248.0], [195.0, 4921.0], [194.0, 6979.0], [193.0, 3650.5], [207.0, 3159.0], [205.0, 4016.0], [204.0, 4483.0], [203.0, 4257.0], [202.0, 8743.0], [201.0, 2812.0], [200.0, 5076.0], [215.0, 3624.5], [214.0, 7016.0], [213.0, 7240.0], [212.0, 6533.5], [210.0, 2063.0], [209.0, 3150.0], [208.0, 3900.0], [223.0, 3498.5], [222.0, 3795.6666666666665], [221.0, 2853.0], [220.0, 2870.0], [219.0, 3920.0], [218.0, 3525.5], [217.0, 3832.5000000000005], [216.0, 4930.25], [231.0, 4116.0], [230.0, 2814.0], [229.0, 4244.75], [228.0, 3857.0], [227.0, 3719.0], [226.0, 4269.0], [225.0, 4769.0], [224.0, 3093.0], [239.0, 3399.0], [238.0, 3651.0], [237.0, 6358.0], [236.0, 3462.5], [235.0, 4158.0], [234.0, 4662.333333333333], [233.0, 3350.0], [247.0, 3664.0], [246.0, 3620.0], [245.0, 3643.3333333333335], [244.0, 3733.0], [243.0, 3633.0], [242.0, 3776.0], [241.0, 3553.6666666666665], [240.0, 5703.666666666667], [255.0, 3574.0], [254.0, 3564.3333333333335], [253.0, 3545.0], [252.0, 3419.0], [251.0, 3585.0], [250.0, 3487.0], [249.0, 3534.6666666666665], [248.0, 3410.0], [270.0, 3287.0], [271.0, 7473.375000000001], [269.0, 5443.0], [268.0, 3338.0], [267.0, 3295.0], [266.0, 3317.5], [265.0, 3385.0], [264.0, 3352.75], [263.0, 3292.5], [257.0, 3441.0], [256.0, 3511.0], [259.0, 6355.333333333333], [258.0, 3422.3333333333335], [262.0, 3357.3333333333335], [261.0, 3417.0], [260.0, 3341.0], [286.0, 3020.0], [287.0, 2984.0], [285.0, 13740.0], [284.0, 5956.666666666667], [283.0, 5464.0], [282.0, 3008.0], [281.0, 6818.5], [280.0, 3057.5], [279.0, 3095.0], [273.0, 3252.0], [272.0, 3244.0], [275.0, 3063.0], [274.0, 3150.0], [278.0, 3037.0], [277.0, 3128.5], [276.0, 3132.0], [302.0, 2753.5], [303.0, 2821.0], [301.0, 4985.4], [300.0, 4562.0], [299.0, 2798.0], [298.0, 11362.25], [297.0, 2808.6666666666665], [296.0, 2728.0], [295.0, 2873.0], [289.0, 2882.5], [288.0, 2978.0], [291.0, 2950.0], [290.0, 2904.0], [294.0, 2755.5], [293.0, 2890.0], [292.0, 2814.0], [318.0, 4109.0], [319.0, 2605.0], [317.0, 2679.0], [316.0, 2682.0], [315.0, 2592.5], [314.0, 2697.0], [313.0, 2662.0], [312.0, 2655.0], [311.0, 2823.0], [305.0, 2674.0], [304.0, 2691.3333333333335], [307.0, 2649.0], [306.0, 2605.0], [310.0, 2712.0], [309.0, 3117.4], [308.0, 2656.0], [334.0, 3322.25], [335.0, 3801.8], [333.0, 2635.0], [332.0, 2655.0], [331.0, 2654.0], [330.0, 3560.3333333333335], [329.0, 2584.0], [328.0, 2681.5], [327.0, 2651.0], [321.0, 3838.5], [320.0, 2614.0], [323.0, 2654.0], [322.0, 3587.0], [326.0, 2853.0], [325.0, 2547.0], [324.0, 2696.0], [350.0, 3739.0], [351.0, 3710.5], [349.0, 2695.0], [348.0, 3676.0], [347.0, 2606.0], [346.0, 5183.0], [345.0, 2758.0], [344.0, 4311.0], [343.0, 2629.0], [337.0, 2739.0], [336.0, 2737.5], [339.0, 4385.25], [338.0, 2622.0], [342.0, 2644.25], [341.0, 5177.0], [340.0, 2714.0], [366.0, 5037.0], [367.0, 3273.0], [365.0, 2572.5], [364.0, 2543.0], [363.0, 2583.0], [362.0, 2569.0], [361.0, 2604.0], [360.0, 2506.0], [359.0, 2595.0], [353.0, 3842.5], [352.0, 2543.5], [355.0, 3221.0], [354.0, 3792.5], [358.0, 2592.0], [357.0, 2435.0], [356.0, 2538.0], [382.0, 4456.0], [383.0, 4399.0], [381.0, 4536.0], [380.0, 4774.0], [379.0, 4704.25], [378.0, 3714.3333333333335], [377.0, 4712.0], [376.0, 4855.0], [375.0, 4382.0], [369.0, 4007.6], [371.0, 2498.0], [370.0, 2555.0], [374.0, 3657.5], [373.0, 4768.0], [372.0, 4543.0], [398.0, 4178.5], [399.0, 4113.0], [397.0, 4283.0], [396.0, 4904.0], [395.0, 4233.4], [394.0, 4051.0], [393.0, 4267.0], [392.0, 4053.0], [391.0, 4234.0], [385.0, 4109.0], [384.0, 5495.0], [387.0, 4616.6], [386.0, 4672.0], [390.0, 3984.0], [389.0, 4027.0], [388.0, 5076.333333333333], [414.0, 5235.0], [415.0, 3477.0], [413.0, 5798.666666666667], [412.0, 5767.833333333333], [411.0, 5040.75], [410.0, 3580.0], [409.0, 3590.0], [408.0, 3620.25], [407.0, 3636.5], [401.0, 4626.0], [400.0, 4068.0], [403.0, 3811.0], [402.0, 3869.0], [406.0, 3744.5], [405.0, 3784.75], [404.0, 3880.0], [430.0, 3152.0], [431.0, 3162.5], [429.0, 9059.0], [428.0, 4155.5], [427.0, 3174.0], [426.0, 3272.5], [425.0, 8263.0], [424.0, 3362.5], [423.0, 3382.5], [417.0, 3471.5], [416.0, 3458.0], [419.0, 3450.0], [418.0, 4693.333333333333], [422.0, 5188.25], [421.0, 9400.5], [420.0, 3502.0], [446.0, 4370.200000000001], [447.0, 3191.3333333333335], [445.0, 3761.5], [444.0, 3258.7], [443.0, 3521.8666666666663], [442.0, 3142.0], [441.0, 3551.0], [440.0, 3259.5], [439.0, 3008.0], [433.0, 4364.956521739131], [432.0, 3261.0], [435.0, 4703.0], [434.0, 3290.0], [438.0, 3665.75], [437.0, 3982.6666666666665], [436.0, 4308.8], [462.0, 4885.287128712874], [463.0, 4114.12], [461.0, 4784.47619047619], [460.0, 5014.0], [459.0, 3119.0], [458.0, 3559.25], [457.0, 3624.6000000000004], [456.0, 3380.923076923077], [455.0, 3557.5], [449.0, 3278.5], [448.0, 3251.5], [451.0, 3900.5], [450.0, 3985.0], [454.0, 3773.6000000000004], [453.0, 3605.0], [452.0, 4125.692307692308], [478.0, 4002.5], [479.0, 6071.169491525424], [477.0, 3995.2500000000005], [476.0, 4531.666666666667], [475.0, 3853.5483870967737], [474.0, 4399.000000000002], [473.0, 5347.076923076923], [472.0, 3943.0], [471.0, 4871.253968253968], [465.0, 4157.647887323944], [464.0, 3930.0], [467.0, 4374.363095238098], [466.0, 4657.916666666666], [470.0, 7143.839999999998], [469.0, 3195.2], [468.0, 3308.8947368421054], [494.0, 4395.8], [495.0, 4254.608695652175], [493.0, 3333.0], [492.0, 5349.538461538461], [491.0, 4057.1111111111113], [490.0, 4858.90909090909], [489.0, 5318.0], [488.0, 4856.333333333333], [487.0, 4807.823529411765], [481.0, 4081.714285714286], [480.0, 4364.363636363636], [483.0, 3672.375], [482.0, 4566.758620689656], [486.0, 4677.529411764706], [485.0, 4738.971830985915], [484.0, 4298.447368421052], [500.0, 2141.8798586572434], [499.0, 2779.0], [498.0, 3409.5882352941176], [497.0, 4064.406593406594], [496.0, 4095.428571428571], [1.0, 964.0]], "isOverall": false, "label": "HTTP Request", "isController": false}, {"data": [[396.3227999999996, 4063.491199999998]], "isOverall": false, "label": "HTTP Request-Aggregated", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 500.0, "title": "Time VS Threads"}},
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
        data : {"result": {"minY": 431.3833333333333, "minX": 1.51549284E12, "maxY": 621934.6166666667, "series": [{"data": [[1.51549284E12, 621934.6166666667], [1.5154929E12, 37733.0]], "isOverall": false, "label": "Bytes received per second", "isController": false}, {"data": [[1.51549284E12, 7110.283333333334], [1.5154929E12, 431.3833333333333]], "isOverall": false, "label": "Bytes sent per second", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.5154929E12, "title": "Bytes Throughput Over Time"}},
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
        data: {"result": {"minY": 1674.3426573426573, "minX": 1.51549284E12, "maxY": 4208.441663131096, "series": [{"data": [[1.51549284E12, 4208.441663131096], [1.5154929E12, 1674.3426573426573]], "isOverall": false, "label": "HTTP Request", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.5154929E12, "title": "Response Time Over Time"}},
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
        data: {"result": {"minY": 1670.804195804196, "minX": 1.51549284E12, "maxY": 4136.199830292747, "series": [{"data": [[1.51549284E12, 4136.199830292747], [1.5154929E12, 1670.804195804196]], "isOverall": false, "label": "HTTP Request", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.5154929E12, "title": "Latencies Over Time"}},
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
        data: {"result": {"minY": 16.468531468531474, "minX": 1.51549284E12, "maxY": 38.6580398812048, "series": [{"data": [[1.51549284E12, 38.6580398812048], [1.5154929E12, 16.468531468531474]], "isOverall": false, "label": "HTTP Request", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.5154929E12, "title": "Connect Time Over Time"}},
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
        data: {"result": {"minY": 304.0, "minX": 1.51549284E12, "maxY": 24169.0, "series": [{"data": [[1.51549284E12, 23677.0], [1.5154929E12, 24169.0]], "isOverall": false, "label": "Max", "isController": false}, {"data": [[1.51549284E12, 317.0], [1.5154929E12, 304.0]], "isOverall": false, "label": "Min", "isController": false}, {"data": [[1.51549284E12, 6770.000000000002], [1.5154929E12, 6696.200000000001]], "isOverall": false, "label": "90th percentile", "isController": false}, {"data": [[1.51549284E12, 13642.760000000002], [1.5154929E12, 13779.159999999982]], "isOverall": false, "label": "99th percentile", "isController": false}, {"data": [[1.51549284E12, 8866.599999999988], [1.5154929E12, 8732.09999999996]], "isOverall": false, "label": "95th percentile", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.5154929E12, "title": "Response Time Percentiles Over Time (successful requests only)"}},
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
    data: {"result": {"minY": 1233.0, "minX": 2.0, "maxY": 3625.0, "series": [{"data": [[2.0, 1233.0], [39.0, 3625.0]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 39.0, "title": "Response Time Vs Request"}},
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
    data: {"result": {"minY": 1231.0, "minX": 2.0, "maxY": 3523.0, "series": [{"data": [[2.0, 1231.0], [39.0, 3523.0]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 39.0, "title": "Latencies Vs Request"}},
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
        data: {"result": {"minY": 0.9, "minX": 1.51549284E12, "maxY": 40.766666666666666, "series": [{"data": [[1.51549284E12, 40.766666666666666], [1.5154929E12, 0.9]], "isOverall": false, "label": "hitsPerSecond", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.5154929E12, "title": "Hits Per Second"}},
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
        data: {"result": {"minY": 2.3833333333333333, "minX": 1.51549284E12, "maxY": 39.28333333333333, "series": [{"data": [[1.51549284E12, 39.28333333333333], [1.5154929E12, 2.3833333333333333]], "isOverall": false, "label": "200", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.5154929E12, "title": "Codes Per Second"}},
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
        data: {"result": {"minY": 2.3833333333333333, "minX": 1.51549284E12, "maxY": 39.28333333333333, "series": [{"data": [[1.51549284E12, 39.28333333333333], [1.5154929E12, 2.3833333333333333]], "isOverall": false, "label": "HTTP Request-success", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.5154929E12, "title": "Transactions Per Second"}},
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
