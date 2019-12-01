/**
 * FlowReCaptcha plugin for Craft CMS
 *
 * FlowReCaptcha JS
 *
 * @author    Flow Communications
 * @copyright Copyright (c) 2018 Flow Communications
 * @link      https://www.flowsa.com
 * @package   FlowReCaptcha
 * @since     0.0.1
 */

function onSubmit(token) {
  var recaptchaElement = $('[name="g-recaptcha-response"]').filter(function () {
    return this.value == token;
  });
  console.log('recaptchaElement', recaptchaElement);
  if (recaptchaElement.length > 0) {
    recaptchaElement.closest('form').submit();
  }
}

function GetReCaptchaID(containerID) {
  var retval = -1;
  $(".g-recaptcha").each(function (index) {
    if (this.id == containerID) {
      retval = index;
      return;
    }
  });
  return retval;
}


$(document).on('submit', 'form', function (event) {
  var recaptchaElement = $(this).find('[name="g-recaptcha-response"]');
  var reCaptchaValue = recaptchaElement.val().trim();

  if (recaptchaElement && reCaptchaValue === '') {
    event.preventDefault();
    var reCaptchaID = $(this).find('.g-recaptcha').attr('id');
    reCaptchaID = GetReCaptchaID(reCaptchaID);
    // console.log('reCaptchaID', reCaptchaID);
    grecaptcha.reset(reCaptchaID);
    grecaptcha.execute(reCaptchaID);
  }
});

