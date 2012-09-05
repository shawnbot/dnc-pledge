<?php

/*
 * This is a proxy for data from the Obama campaign. It fetches the URI from 
 * this base URL, passes through the appropriate cache control and CORS 
 * headers, then converts the response body from Latin-1 to UTF-8.
 */

define('PROXY_BASE', "http://s3.amazonaws.com/fe62801166d8f0c4814d395147eaf91e.boprod.net");

ini_set('include_path', ini_get('include_path').PATH_SEPARATOR.'/usr/share/pear');

require_once 'PEAR.php';
require_once 'HTTP/Request.php';

$uri = $_SERVER['QUERY_STRING']
    ? sprintf("%s?%s", $_SERVER['PATH_INFO'], $_SERVER['QUERY_STRING'])
    : $_SERVER['PATH_INFO'];
$url = PROXY_BASE . $uri;

if ($_GET['test']) {
    header('HTTP/1.1 200');
    header('Content-Type: text/plain');
    die("$url\n");
}

$req = new HTTP_Request($url);
$res = $req->sendRequest();
$code = $req->getResponseCode();
$type = $req->getResponseHeader('content-type');
$cors = $req->getResponseHeader('access-control-allow-origin');
$filename = array_pop(explode("/", $uri));

if (!in_array($code, array(200, 201))) {
    header('HTTP/1.1 400');
    header("Content-Type: $type");
    print $req->getResponseBody();
    exit();
}

if (substr($filename, -4) === ".csv") {
    $type = "text/csv";
}

header('HTTP/1.1 200');
header('Cache-Control: public');
header("Content-Type: $type; charset=utf-8");
header("Content-Disposition: inline; filename=$filename");
header('Last-Modified: '.$req->getResponseHeader('last-modified'));
header('Date: '.$req->getResponseHeader('date'));
header('Etag: '.$req->getResponseHeader('etag'));
if ($cors) {
    header("Access-Control-Allow-Origin: $cors");
}

print iconv("ISO-8859-1", "UTF-8", $req->getResponseBody());
exit();

?>
