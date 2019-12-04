jQuery(function($) {
    if (typeof ngg_pro_proofing_i18n != 'undefined') {
    $('#npl_content').on('npl_ready', function (e, data) {
        var methods = data.methods;
        var self = data.galleria_theme;
        methods.thumbnails.proofing = {
            init: function() {},

            proofing_button: $('<i/>')
                .addClass('nggpl-toolbar-button-proofing fa fa-star')
                .attr({'title': ngg_pro_proofing_i18n.nggpl_title}),

            get_active_color: function() {
                var retval = '#ffff00';
                if (typeof ngg_proofing_settings !== 'undefined') {
                    retval = ngg_proofing_settings.active_color;
                }
                return retval;
            },

            events: {
                bind: function() {
                    if (typeof ngg_image_proofing !== 'undefined') {
                        self.bind('npl_init', this.npl_init);
                        self.bind('image', this.image);
                    }
                },

                is_proofing_enabled: function() {
                    return methods.galleria.get_displayed_gallery_setting('ngg_proofing_display', false);
                },

                is_image_proofed: function() {
                    var image_id = methods.galleria.get_current_image_id();
                    var gallery_id = $.nplModal('get_state').gallery_id;
                    var proofed_list = ngg_image_proofing.getList(gallery_id);
                    var index = proofed_list.indexOf(image_id.toString());

                    return (index > -1);
                },

                image: function() {
                    if (methods.thumbnails.proofing.events.is_proofing_enabled()) {
                        var btn = $('.galleria-nextgen-buttons .nggpl-toolbar-button-proofing');
                        if (methods.thumbnails.proofing.events.is_image_proofed()) {
                            btn.css({color: methods.thumbnails.proofing.get_active_color()});
                        } else {
                            // If there's no custom icon color then setting the color attribute to '' will not
                            // remove our above color attribute. Remove the style attribute entirely and reset
                            btn.removeAttr('style');
                        }
                    }
                },

                npl_init: function() {
                    if (methods.thumbnails.proofing.events.is_proofing_enabled()) {
                        methods.thumbnails.register_button(
                            methods.thumbnails.proofing.proofing_button,
                            function(event) {
                                methods.thumbnails.proofing.events.button_clicked(event);
                            }
                        );
                    }
                },

                button_clicked: function (event) {
                    var state = $.nplModal('get_state');
                    ngg_image_proofing.addOrRemoveImage(state.gallery_id, state.image_id);
                    methods.thumbnails.proofing.events.image();
                    event.preventDefault();
                }
            }
        };

        methods.thumbnails.proofing.events.bind();
    });
}});
