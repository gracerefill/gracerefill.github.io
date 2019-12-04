(function($){

    var ngg_methods = {
        get_gallery: function (gallery_id) {
            var result = null;
            if ('undefined' == typeof window.galleries) {
                return result;
            }
            return _.find(galleries, function(gallery) {
                return (gallery.ID == gallery_id);
            });
        },
        get_setting: function(gallery_id, name, def, type) {
            type = type || 'bool';
            var gallery = this.get_gallery(gallery_id);
            if (gallery && typeof gallery.display_settings[name] != 'undefined')
                def = gallery.display_settings[name];
            if (type == 'bool') {
                if (def == 1 || def == '1')
                    def = true;
                if (def == 0 || def == '0')
                    def = false;
            } else if (type == 'int') {
                def = parseInt(def);
            } else if (type == 'string') {
            }
            return def;
        }
    };
    
    $(".nextgen_pro_sidescroll_wrapper").each( function() {
        var gallery_id = $(this).parent().attr('id').replace(/^gallery_/, '');
        var $this = $(this);

        var p = $(this).sidescroll({
            logger: false,
            height: ngg_methods.get_setting(gallery_id, 'height', '400', 'int') + 'px',
            nextCallback: function(gallery) {
                return $(gallery).find('img.active').closest('.image-wrapper').next('.image-wrapper').find('img');
            },
            prevCallback: function(gallery) {
                return $(gallery).find('img.active').closest('.image-wrapper').prev('.image-wrapper').find('img');
            }
        });

        if ( ngg_methods.get_setting(gallery_id, 'captions_enabled', false) ) {

            var ranonce = false;
            $(document).on('ngg-captions-added', function() {
                p.init();

                // ngg-captions-added is triggered for every image in the gallery; we only want one listener
                if (!ranonce) {
                    ranonce = true;
                    $this.on('images-loaded', function() {
                        setTimeout(function() {
                            $(window).trigger('refreshed');
                        }, 50);
                    });
                }
            });

            // TODO: fix this better. Running this after init() causes severe performance problems, but it needs
            // to be triggered once after the page has first loaded in order to ensure hover caption descriptions
            // are given the space they need to display
            setTimeout(function() {
                $(window).trigger('refreshed');
            }, 1500);

        } else {
            $(document).ready(function() { p.init(); } );
        }

        $this.on('images-loaded', function() {
            $this.parent('.nextgen_pro_sidescroll').addClass('nextgen_pro_sidescroll_open');
        })
    });

})(jQuery);





















