(function($){
    // Namespace and utility functions
    Ngg_Pro_Cart = {
        get_ajax_url: function() {
            return (typeof(photocrati_ajax) != 'undefined') ? photocrati_ajax.url :
                (typeof(parent.photocrati_ajax) != 'undefined' ? parent.photocrati_ajax.url : null);
        },

        Models: {},
        Views: {}
    };


    // Define image model
    Ngg_Pro_Cart.Models.Image = Backbone.Model.extend({
        idAttribute: 'pid',

        subtotal: function() {
            var retval = 0.0;
            this.get('items').each(function(item){
                retval += item.subtotal();
            });
            return retval;
        },

        get_full_exif_dimensions: function() {
            return this.get('crop_dimensions');
        }
    });

    // Define pricelist item model
    Ngg_Pro_Cart.Models.PricelistItem = Backbone.Model.extend({
        idAttribute: 'ID',

        defaults: {
            quantity: 0,
            shippable_to: []
        },

        subtotal: function() {
            return parseFloat(this.get('price')) * parseInt(this.get('quantity'));
        }
    });

    // Define Image Collection
    Ngg_Pro_Cart.Models.ImageCollection = Backbone.Collection.extend({
        model: Ngg_Pro_Cart.Models.Image,

        subtotal: function() {
            var retval = 0.0;
            this.each(function(image){
                retval += image.subtotal();
            });
            return retval;
        }
    });

    // Define Pricelist Item Collection
    Ngg_Pro_Cart.Models.PricelistItemCollection = Backbone.Collection.extend({
        model: Ngg_Pro_Cart.Models.PricelistItem
    });


    // Define Cart Model
    Ngg_Pro_Cart.Models.Cart = Ngg_Pro_Cart.Models.ImageCollection.extend({
        shipping: 0.0,
        total: 0.0,
        sub_total: 0.0,
        undiscounted_subtotal: 0.0,
        discount_given: 0.0,
        tax: 0.0,
        settings: {
            shipping_address: {
                name: '',
                street_address: '',
                address_line: '',
                country: '',
                state: '',
                zip: '',
            },
            studio_address: {
                name: '',
                street_address: '',
                address_line: '',
                country: '',
                state: '',
                zip: '',
            }
        },
        coupon: '',
        has_shippable_items: false,
        shipping_methods: [], /* should probably be an empty object */

        empty_cart: function() {
            this.reset();
            this.storage.set('ngg_pro_cart', this.getFullCartData());
            this.crop_storage.reset();
            return this;
        },

        initialize: function() {
            this.ready               = false;
            this.storage             = this.get_storage();
            this.crop_storage        = this.get_storage('nextgen-gallery-crop');

            this.triggerReady        = this.triggerReady.bind(this);
            this._updateCartItems    = this._updateCartItems.bind(this);
            this._updateCartSettings = this._updateCartSettings.bind(this);
            this.save                = this.save.bind(this);
            this.loadData            = this.loadData.bind(this);

            // We need to delay to give a chance for views to register there event handlers
            Promise.delay(100)
                .then(this.loadData)
                .then(this.triggerReady);
        },

        triggerReady: function() {
            this.ready = true;
            this.trigger('ready');
            this.trigger('cartReady');
        },

        getMinimalCartData: function() {
            var cartData = this.storage.get('ngg_pro_cart');
            if (_.isObject(cartData)) {
                return cartData;
            } else if (_.isString(cartData)) {
                return JSON.parse(cartData);
            } else {
                return null
            }
        },

        getFullCartData: function() {
            var cart = {
                image_ids: [],
                images: {},
                coupon: this.coupon
            };

            this.each(function(image_obj) {
                cart.image_ids.push(image_obj.id);
                var stored_image = {
                    item_ids: [],
                    items: {}
                };
                image_obj.get('items').each(function(item) {
                    stored_image.item_ids.push(item.id);
                    stored_image.items[item.id] = {quantity: item.get('quantity')};
                });

                cart.images[image_obj.id] = stored_image;
            });

            return cart;
        },

        getCartData : function() {
            return !this.ready ? this.getMinimalCartData() : this.getFullCartData();
        },

        requestCartData: function() {
            var request = {
                action: 'get_cart_items',
                cart: this.getCartData(),
                settings: this.settings
            };

            return new Promise(function(resolve, reject) {
                $.post(Ngg_Pro_Cart.get_ajax_url(), request, function(response) {
                    if (_.isString(response)) {
                        try {
                            response = JSON.parse(response);
                            resolve(response);
                        }
                        catch (err) {
                            reject("Invalid JSON returned from server")
                        }
                    } else {
                        resolve(response);
                    }
                });
            });
        },

        getImageFromCart: function(imageId) {
            var imageModel = this.get(imageId);
            if (!imageModel) {
                imageModel = this.findWhere({id: imageId})
            }
            if (!imageModel) {
                imageModel = new Ngg_Pro_Cart.Models.Image({pid: imageId, items: new Ngg_Pro_Cart.Models.PricelistItemCollection()});
            }
            return imageModel;
        },

        _updateCartSettings: function(response) {
            this.settings                       = response.settings;
            this.has_shippable_items            = response.has_shippable_items;
            this.shipping_methods               = response.shipping_methods;
            this.shipping                       = parseFloat(response.shipping);
            this.sub_total                      = parseFloat(response.subtotal);
            this.total                          = parseFloat(response.total);
            this.tax                            = parseFloat(response.tax);
            this.undiscounted_subtotal          = parseFloat(response.undiscounted_subtotal);

            if (_.isObject(response.coupon)) {
                this.coupon                     = response.coupon.code;
                this.discount_given             = parseFloat(response.coupon.discount_given);
            } else {
                this.coupon = '';
                this.discount_given = 0;
            }

            return this;
        },

        _updateCartItems: function(response) {
            // Add the images to the cart
            for (var image_index=0; image_index<response.image_ids.length; image_index++) {
                var imageId                 = parseInt(response.image_ids[image_index]);
                var updatedImageProperties  = response.images[imageId];
                var imageModel              = this.getImageFromCart(imageId);

                for (var item_index=0; item_index<updatedImageProperties.item_ids.length; item_index++) {
                    var itemId                          = parseInt(updatedImageProperties.item_ids[item_index]);
                    if (itemId > 0) {
                        var updatedItemProperties       = updatedImageProperties.items[itemId];
                        updatedItemProperties.item_id   = itemId;
                        updatedItemProperties.image_id  = imageId;
                        itemModel                       = imageModel.get('items').get(itemId);
                        if (!itemModel) {
                            itemModel = new Ngg_Pro_Cart.Models.PricelistItem(updatedItemProperties)
                        } else {
                            itemModel.set(updatedItemProperties);
                        }
                        imageModel.get('items').add(itemModel, {merge: true});
                    }
                }
                delete updatedImageProperties.item_ids;
                delete updatedImageProperties.items;
                imageModel.set(updatedImageProperties);
                this.add(imageModel, {merge: true});
            }

            return this;
        },

        // We call loadData() when we need something that we're missing.
        // loadData() can be called with a minimal representation of a cart, and in turn, have the server
        // return a fully populated cart. Or we can send a full representation of the cart, have the server
        // do some computations on that data, and return an updated representation. We might do that to get
        // updated shipping methods, taxes, shipping costs, etc.
        loadData: function() {
            this.trigger('beforeLoadData');

            var cart = this;
            var $overlay = $("#ngg_pro_cart_subitems_overlay");

            return this.requestCartData()
                .then(function(response) {
                    cart._updateCartItems(response);
                    cart._updateCartSettings(response);
                    return response;
                })
                .then(function(response) {
                    cart.save();
                    return response;
                })
                .then(function(response) {
                    cart.trigger('dataLoaded', response);
                })
                .catch(function(err) {
                    console.log(err);
                })
                .finally(function() {
                    $overlay.removeClass('ngg_pro_cart_subitems_overlay_open');
                });
        },

        get_storage: function(storage_id) {
            if (typeof(storage_id) === "undefined" || storage_id == null)
                storage_id = 'nextgen-gallery-cart';

            if (Ngg_Pro_Cart_Settings.use_cookies == "true") {
                return Object.assign(Ngg_Store, {
                    reset: function() {
                        EasyCookie.keys().map(Cookies.remove);
                        Ngg_Store.save();
                    }
                });
            } else {
                var cart_storage_options = {
                    namespace: storage_id,
                    storages: ['local', 'cookie'],
                    storage: 'local',
                    expiresDays: 10,
                    secure: false
                };
                var storage = new window.Basil(cart_storage_options);
                return {
                    get: function(key) { return storage.get(key); },
                    set: function(key, value) { return storage.set(key, value); },
                    del: function(key) { storage.remove(key); return !this.has(key); },
                    has: function(key) { var value = this.get(key); return typeof(value) != 'undefined' && value != null; },
                    save: function() { return true; },
                    reset: function() { storage.reset(); }
                };
            }
        },

        getFormattedCurrency: function(field) {
            if (field == 'subtotal') {
                field = 'sub_total';
            }

            var val = this[field];

            // _.isNumber() returns true for NaN
            if (!_.isNumber(val) || _.isNaN(val)) {
                val = 0.0;
            }

            return sprintf(Ngg_Pro_Cart_Settings.currency_format, val);
        },

        /**
         * Saves the representation of the cart in the local browser storage
         */
        save: function() {
            this.storage.set('ngg_pro_cart', this.getCartData());
            return this;
        },

        updateQuantity: function(image_id, item, options) {
            if (!_.isObject(options))        options = {};
            if (!_.has(options, 'loadData')) options.loadData = true;

            var remove_item = (parseInt(item.get('quantity')) > 0) ? false : true;
            var imageModel  = this.getImageFromCart(image_id);

            var cart_items = imageModel.get('items');
            var cart_item  = cart_items.get(item.id);
            if (cart_item) {
                if (remove_item) {
                    cart_items.remove(cart_item);
                } else {
                    cart_item.set(item.attributes);
                }
            } else if (!remove_item) {
                cart_items.add(item.attributes);
            }

            if (!remove_item) {
                this.add(imageModel, {merge: true});
            }

            if (cart_items.length == 0) {
                this.remove(imageModel);
            }

            this.save();

            if (options.loadData) {
                this.loadData();
            }
        },

        item_count: function() {
            var retval = 0;
            this.each(function(image){
                retval += image.get('items').length
            });
            return retval;
        }
    });

    Ngg_Pro_Cart.get_instance = function() {
        if (typeof(Ngg_Pro_Cart['instance']) == 'undefined') {
            Ngg_Pro_Cart.instance = new Ngg_Pro_Cart.Models.Cart();
        }
        return Ngg_Pro_Cart.instance;
    };

    // Define a type of view that has template capabilities
    Ngg_Pro_Cart.Views.TemplateView = Backbone.View.extend({
        render_template: function(params){
            var template = $('#' + this.template).html();
            for (var key in this.model.attributes) {
                if (typeof(key) == 'string') {
                    var value = this.model.get(key);
                    var placeholder = '{' + this.object_name+'.' + key + '}';
                    while (template.indexOf(placeholder) >= 0) {
                        template = template.replace(placeholder, value);
                    }
                }
            }
            if (typeof(params) != 'undefined') {
                for (var key in params) {
                    var placeholder = '{' + key + '}';
                    while (template.indexOf(placeholder) >= 0) {
                        template = template.replace(placeholder, params[key]);
                    }
                }
            }

            this.$el.html(template);
        }
    });

    // Define the Pricelist Item Row View
    Ngg_Pro_Cart.Views.Item_Row = Ngg_Pro_Cart.Views.TemplateView.extend({
        tagName: 'tr',
        className: 'ngg_pro_cart_image_item',
        template: 'ngg_pro_cart_item_tmpl',
        object_name: 'item',

        initialize: function(params){
            this.image_id = params.image_id;
            this.model.on('change:quantity', this.update_subtotal, this);
            this.image = Ngg_Pro_Cart.get_instance().get(this.image_id);
        },

        is_lab_item: function() {
            var retval = false;
            var source = this.model.get('source');
            if (Ngg_Pro_Cart_Settings.sources.hasOwnProperty(source)) {
                retval = Ngg_Pro_Cart_Settings.sources[source];
            }
            return retval;
        },

        update_subtotal: function() {
            this.$el.find('.subtotal_column span').html(sprintf(Ngg_Pro_Cart_Settings.currency_format, this.model.subtotal()));
        },

        render: function() {
            this.render_template({
                'item.id' : this.model.id,
                'image.filename': this.image.get('filename'),
                'image.thumbnail_url': this.image.get('thumbnail_url'),
                'image.full_url': this.image.get('full_url'),
                'image.width': this.image.get('width'),
                'image.height': this.image.get('height'),
                'image.alttext': this.image.get('alttext')
            });

            // Update price
            this.$el.find('.price_column').html(sprintf(Ngg_Pro_Cart_Settings.currency_format, this.model.get('price')));

            // Update subtotal
            this.update_subtotal();

            var updateCropPreview = function (item) {
                var crop_offset = item.model.get('crop_offset');
                var cropPoints = crop_offset ? crop_offset.split(',').map(function (str) { return str.trim(); }) : [];

                if (cropPoints.length < 4)
                    return;

                var sourceData = item.model.get('source_data');
                var printRatio = sourceData['lab_properties']['aspect']['ratio'];
                var imgDims = item.image.get_full_exif_dimensions();
                var $thumbCont = item.$el.find('.thumbnail_column .thumbnail-container');
                var $thumb = $thumbCont.find('img');
                var thumbWidth = $thumb.width();
                var thumbHeight = $thumb.height();
                var $crop_preview = $thumbCont.find('.crop-preview');

                if ($crop_preview.length == 0)
                    $crop_preview = $('<div class="crop-preview" />').appendTo($thumbCont);

                var ratioX = thumbWidth / imgDims.width;
                var ratioY = thumbHeight / imgDims.height;
                var left = cropPoints[0] * ratioX;
                var top = cropPoints[1] * ratioY;
                var width = Math.ceil(((cropPoints[2] - cropPoints[0]) * ratioX));
                var height = Math.ceil(((cropPoints[3] - cropPoints[1]) * ratioY));

                var borderWidth = parseInt($crop_preview.css("border-left-width"), 10);

                width = width - (borderWidth * 2);
                height = height - (borderWidth * 2);

                $crop_preview.css({
                    'left': left,
                    'top': top
                });
                $crop_preview.width(width);
                $crop_preview.height(height);
            };

            var _this = this;
            var $cropBtn = this.$el.find('.ngg-edit-crop');
            if (this.is_lab_item()) {
                var imgDims = this.image.get('crop_dimensions');
                var sourceData = this.model.get('source_data');
                var printRatio = parseFloat(sourceData['lab_properties']['aspect']['ratio']);
                var imgRatio = imgDims.width / imgDims.height;
                var $thumbCol = this.$el.find('.thumbnail_column');
                var $cropBtn = this.$el.find('.ngg-edit-crop');
                var $crop_offset = this.$el.find('.thumbnail_column :input[name$="[crop_offset]"]');
                var printW = sourceData['lab_properties']['W'];
                var printH = sourceData['lab_properties']['H'];
                var printSuffix = printW.toString() + 'w_' + printH.toString() + 'h';
                var storeKey = 'image_crop_' + this.image_id.toString() + '_' + printSuffix;
                var crop_offset = Ngg_Pro_Cart.get_instance().crop_storage.get(storeKey);
                if (crop_offset != null && crop_offset != '') {
                    this.model.set('crop_offset', crop_offset);
                }
                var $img = $thumbCol.find('img');
                $img.width(imgDims.width);
                $img.height(imgDims.height);
                var imgW = $img.width();
                var imgH = $img.height();
                $cropBtn.data('imageSrc',this.image.get('crop_url'));
                $cropBtn.data('printRatio', printRatio);
                $cropBtn.data('storeKey', storeKey);
                $cropBtn.data('imgRatio', imgRatio);
                $cropBtn.data('cropZoom', imgW / this.image.get_full_exif_dimensions().width);
                $cropBtn.data('cropInput', $crop_offset.attr('name'));

                var item = this;
                $cropBtn.on('click', function (e) {
                    e.preventDefault();
                    var jthis = $(this);
                    var src = jthis.data('imageSrc');
                    var printRatio = jthis.data('printRatio');
                    var storeKey = jthis.data('storeKey');
                    var imgRatio = jthis.data('imgRatio');
                    var cropZoom = jthis.data('cropZoom');
                    var crop_offset = item.model.get('crop_offset');
                    var cropPoints = crop_offset ? crop_offset.split(',').map(function (str) { return str.trim(); }) : [];
                    cropPoints = cropPoints.map(function (pt) { return pt * cropZoom; });
                    var cropInput = jthis.data('cropInput');
                    var $cropUI = $('#ngg_crop_ui').clone().detach();
                    $cropUI.width(1000);
                    $cropUI.height(600);
                    $cropUI.show();

                    var resizeCropBox = function ($content) {
                        var w = 1000;
                        var h = 600;
                        var borderW = 40;
                        var borderH = 80;
                        var browserW = $(window).width() - borderW;
                        var browserH = $(window).height() - borderH;
                        var maxW = browserW - Math.min(browserW * 0.018, 25);
                        var maxH = browserH - Math.min(browserH * 0.016, 20);
                        if (w > maxW) {
                            w = maxW;
                        }
                        if (h > maxH) {
                            h = maxH;
                        }
                        $content.width(w);
                        $content.height(h);
                    };

                    var applyCroppie = function ($canvas) {
                        // It is necessary to provide some buffer or the edges of the boundary will not appear
                        // on browsers with a small display size
                        var canvasBuffer = 100;
                        var canvasWidth  = $canvas.width()  - canvasBuffer;
                        var canvasHeight = $canvas.height() - canvasBuffer;

                        // Limit our dimensions to the visible region while maintaining crop & aspect ratios
                        var ratioX = canvasWidth / imgW;
                        var ratioY = canvasHeight / imgH;
                        var baseRatio  = Math.min(ratioX, ratioY);
                        var cropWidth  = imgH * baseRatio;
                        var cropHeight = imgH * baseRatio;

                        var cropRatio = cropWidth / cropHeight;

                        if ((printRatio < 1 && imgRatio > 1) || (printRatio > 1 && imgRatio < 1)) {
                            printRatio = 1 / printRatio;
                        }

                        var ratioDiff = cropRatio - printRatio;

                        if (ratioDiff > 1) {
                            cropHeight = cropWidth / printRatio;
                        } else {
                            cropWidth = cropHeight * printRatio;
                        }

                        // prevent recursion in croppieArgs.update
                        var counter = 0;

                        var croppieArgs = {
                            viewport: {
                                type: 'square',
                                width: cropWidth,
                                height: cropHeight
                            },
                            enableZoom: true,
                            mouseWheelZoom: false,
                            showZoomer: false,
                            enableOrientation: true,
                            update: function (croppie) {
                                // we must force the zoom to remain all the way so that images aren't distorted
                                counter++;
                                if (counter === 2) {
                                    $canvas.croppie('setZoom', '0');
                                }

                                var cropPoints = croppie.points;
                                cropPoints = cropPoints.map(function (pt) {
                                    return pt / cropZoom;
                                });
                                var crop_offset = cropPoints.join(',');
                                _this.model.set('crop_offset', crop_offset);
                                var $cropInput = $(':input[name="' + cropInput + '"]');
                                $cropInput.val(crop_offset);
                                Ngg_Pro_Cart.get_instance().crop_storage.set(storeKey, crop_offset);
                            }
                        };

                        var bindArgs = {
                            url: src
                        };

                        if (cropPoints.length == 4) {
                            bindArgs.points = cropPoints;
                        }

                        $canvas.empty();
                        // this generates an error deep in croppie.js if we just call $canvas.croppie('destroy')
                        $('#ngg_crop_ui .crop-canvas').croppie('destroy');
                        $canvas.croppie(croppieArgs);
                        $canvas.croppie('bind', bindArgs); //.then(function() {
                    };

                    $(window).on('resize orientationchange onfullscreenchange onmozfullscreenchange onwebkitfullscreenchange', function() {
                        var $content = $('.featherlight').find('#ngg_crop_ui');
                        resizeCropBox($content);

                        var $canvas = $content.find('.crop-canvas');
                        if ($canvas.length > 0) {
                            applyCroppie($canvas);
                        }
                    });

                    resizeCropBox($cropUI);
                    $cropUI.show();

                    $.featherlight($cropUI, {
                        closeOnClick: false,
                        otherClose: '.crop-buttons .crop-button-close',

                        afterContent: function (e) {
                            var $canvas = this.$content.find('.crop-canvas');
                            applyCroppie($canvas);
                        },

                        afterClose: function (e) {
                            var image = Ngg_Pro_Cart.get_instance().get(_this.image_id);
                            var cart_items = image.get('items');
                            var cart_item  = cart_items.get(_this.model.id);
                            if (cart_item) {
                                cart_item.set(_this.model.attributes);
                            }
                            updateCropPreview(_this);
                        },

                        onResize: function (e) {
                        }
                    });

                    return false;
                });

                this.$el.find('.thumbnail_column .thumbnail-container img').on('load', function () {
                    setTimeout(function () { updateCropPreview(_this); }, 250);
                });

                $(window).on('resize orientationchange onfullscreenchange onmozfullscreenchange onwebkitfullscreenchange', function() {
                    updateCropPreview(_this);
                });
            } else {
                $cropBtn.remove();
            }

            // It's nonsensical for download items to have a quantity > 1
            if (this.model.get('source') === 'ngg_digital_downloads') {
                this.$el.find('.nggpl-quantity_field_wrapper').addClass('nggpl-digital-download-source');
                this.$el.find('.nggpl-quantity_field').attr('max', 1);
            }

            // Delete button events
            var delete_button = this.$el.find('.ngg_pro_delete_item');
            delete_button.on('click', function(e) {
                e.preventDefault();
                
                if (!_this.collection.busy) {
                    _this.collection.busy = true;
                    _this.collection.remove(_this.model.id);
                    _this.model.set('quantity', 0);
                    _this.$el.fadeOut(400, function() {
                        $(this).remove();
                        _this.collection.busy = false;
                    })
                }                
            });

            // Use -/+ buttons to adjust item quantity
            var quantity_adjusters = this.$el.find('.quantity_column i');
            var debounced_quantity_changed = _.throttle(function(el) {
                var quantity = $(el).val();
                if (quantity && quantity.length > 0) {
                    quantity = parseInt(quantity);
                } else {
                    quantity = 0;
                }

                if (quantity == 0) {
                    _this.collection.remove(_this.model.id);
                    _this.$el.fadeOut(400, function() {
                        $(this).remove();
                    });
                }

                _this.model.set('quantity', quantity);
                Ngg_Pro_Cart.get_instance().updateQuantity(_this.image_id, _this.model);

            }, 1500);

            quantity_adjusters.on('click', function(event) {
                var $target = $(event.currentTarget);
                var $input = $target.siblings('input');
                var step = $target.hasClass('fa-minus') ? -1 : 1;
                var newvalue = parseInt($input.val(), 10) + step;
                var min = parseInt($input.attr('min'), 10);
                var max = parseInt($input.attr('max'), 10);
                if (newvalue < min) { newvalue = min; }
                if (newvalue > max) { newvalue = max; }
                $input.val(newvalue);
                debounced_quantity_changed($input);
            });

            // Quantity field events
            this.$el.find('.nggpl-quantity_field').on('change', function() {
                _this.quantity_changed(this);
            });

            return this.el;
        }
    });

    Ngg_Pro_Cart.Views.Coupon_Row = Backbone.View.extend({
        el: '#ngg_pro_cart_coupon_tr',

        code: '',

        events: {
            'click #ngg_pro_cart_coupon_apply' : 'handle_apply_click',
            'keypress #ngg_pro_cart_coupon_field' : 'handle_apply_key'
        },

        initialize: function() {
            this.model = Ngg_Pro_Cart.get_instance();
            this.model.on('dataLoaded', this.handle_server_update, this);
            if (this.model.ready && this.model.coupon && this.model.discount_given) {
                this.handle_server_update();
            }
        },

        handle_server_update_with_notice: function() {
            this.handle_server_update();

            var cart = this.model;
            var $notice = $('#ngg_pro_cart_coupon_errors');

            if (cart.coupon && cart.discount_given) {
                $notice.hide();
                $('#ngg_pro_cart_coupon_notice').fadeIn().delay(1500).fadeOut(500);
                $('#ngg_pro_cart_coupon_field').blur();

            } else if (!cart.coupon || !cart.discount_given) {
                $notice.text('Invalid coupon');
                $notice.fadeIn().delay(1500).fadeOut(500);
                $('#ngg_pro_cart_coupon_field').focus();
            }
        },

        handle_server_update: function() {
            var cart = this.model;
            var $summaryrows = $('#ngg_pro_cart_coupon_undiscounted_subtotal_tr, #ngg_pro_cart_coupon_discount_amount_tr');

            if (cart.coupon && cart.discount_given) {
                $('#ngg_pro_cart_coupon_hidden_field').val(cart.coupon);
                $('#nggpl-undiscounced_subtotal_field').html(this.model.getFormattedCurrency('undiscounted_subtotal'));
                $('#nggpl-discount_amount_field').html(this.model.getFormattedCurrency('discount_given'));
                $summaryrows.show();

            } else if (!cart.coupon || !cart.discount_given) {
                cart.coupon = '';
                cart.discount_given = 0;
                $summaryrows.hide();
            }
        },

        handle_apply_click: function(event) {
            event.preventDefault();
            this.apply();
        },

        handle_apply_key: function(event) {
            if (event.keyCode === 13) {
                event.preventDefault();
                this.apply();
                return false;
            }
        },

        apply: function() {
            var $field = $('#ngg_pro_cart_coupon_field');
            this.code  = this.model.coupon = $field.val();
            var self   = this;
            $field.val('');
            this.model.loadData().then(function() {
                self.handle_server_update_with_notice();
            });
        }
    });

    // Define Cart View
    Ngg_Pro_Cart.Views.Cart = Backbone.View.extend({
        el: '#ngg_pro_checkout',

        initialize: function() {
            var _this = this;

            this.getRawCountryList()
                .then(function(data){
                    _this.country_list = data;
                    _this.model = Ngg_Pro_Cart.get_instance();
                    _this.model.on('ready', _this.render, _this);
                    _this.model.on('dataLoaded', _this.refreshed_from_server, _this);
                    _this.model.on('beforeDataLoaded', _this.refreshing_from_server(), _this);
                    _this.model.on('change:quantity', _this.update_totals, _this);
                    if (_this.model.ready) {
                        _this.refreshed_from_server();
                        _this.render();
                    }
                })
        },

        events: {
            'keyup .nggpl-quantity_field' : 'sanitize_quantity',
            'input #ngg_pro_cart_fields input' : 'shipping_address_changed',
            'change #ngg_pro_cart_fields select' : 'shipping_address_changed',
            'click #recalculate' : 'recalculate_shipping_and_taxes',
        },

        get_cart_images_el: function() {
            var $images_table = this.$el.find('.ngg_pro_cart_images');

            // Fix IE11 DOM representation
            if ($images_table.length == 0) {
                $images_table = $('.ngg_pro_cart_images').parent().detach();
                this.$el.append($images_table);
                $images_table = this.$el.find('.ngg_pro_cart_images');
            }

            return $images_table;
        },

        fix_ie_dom: function() {
            if (this.$el.find('#ngg_pro_links_wrapper').length == 0) {
                var $links = $('#ngg_pro_links_wrapper').detach();
                this.$el.prepend($links);
            }

            if (this.$el.find('#ngg_pro_checkout_buttons').length == 0) {
                var $buttons = $('#ngg_pro_checkout_buttons').detach();
                this.$el.append($buttons);
            }
        },

        sanitize_quantity: function(e){
            if (!(e.keyCode == 8 || e.keyCode == 37 || e.keyCode == 39 || e.keyCode == 9 || e.keyCode == 46 || (e.charCode >= 48 && e.charCode <= 57))) {
                e.preventDefault();
                return false;
            }
            return true;
        },

        get_shippable_countries: function() {
            var codes = [];
            this.model.each(function(image){
                image.get('items').each(function(item){
                    _.each(item.get('shippable_to'), function(countryCode){
                        codes.push(countryCode);
                    });
                });
            });
            return codes;
        },

        populate_country_list: function (data) {
            var $shipping_fields = $('#ngg_pro_cart_fields');
            var $country = $shipping_fields.find('select.shipping_country');
            var homeCountry = this.model.settings.studio_address.country;
            var $regions_col = $shipping_fields.find('.ngg-field-state .ngg-field-input');
            var $region_input = $regions_col.find('input');
            var countryCount = 0;
            var shippable_country_codes = this.get_shippable_countries();

            if (typeof(data) === 'undefined') {
                data = this.country_data;
            } else {
                this.country_data = data;
            }
          
            // if we have no valid data or Int'l shipping is disabled and have no homeCountry, return
            if (this.country_populated || !data)
                return;

            this.country_populated = true;

            for (var i = 0; i < data.length; i++) {
                var country = data[i];
                var countryCode = country[1];

                if (!shippable_country_codes.includes(countryCode)) continue;

                var regions = country[2];
                var postcodeRe = typeof(country[3]) != "undefined" ? country[3] : '';
                var $option = $('<option />');
                $option.attr('value', countryCode);
                $option.data('postCodeRegex', postcodeRe);
                $option.append(country[0]);
                $country.append($option);
                countryCount += 1;

                if (regions.length > 0) {
                    var $region = $('<select />');
                    $region.append($('<option />').attr('value', '').append(Ngg_Pro_Cart_Settings.i18n.select_region));
                    $region.attr('class', 'shipping_state');
                    $region.data('name', $region_input.data('name'));
                    $region.data('id', $region_input.data('id'));
                    $region.data('countryId', countryCode);

                    for (var l = 0; l < regions.length; l++) {
                        var region = regions[l];
                        var $option_r = $('<option />');
                        $option_r.attr('value', region[1]);
                        $option_r.append(region[0]);
                        $region.append($option_r);
                    }

                    $regions_col.append($region);
                }
            }

            if (countryCount > 1) {
                var $optionDef = $country.find('option[value="' + homeCountry + '"]');
                var $option = $('<option />').attr('value', '');
                $option.append(Ngg_Pro_Cart_Settings.i18n.select_country);
                
                if ($optionDef.size() > 0) {
                    $optionDef.attr('selected', 'selected');
                    $country.val(homeCountry);
                } else {
                    $option.attr('selected', 'selected');
                }
                
                $country.prepend($option);
            }
            this.update_country_bound_fields();
        },
        
        shipping_address_changed: function (e) {
            var $target = $(e.currentTarget);
            var targetName = $target.attr('name');
            
            this.update_country_bound_fields();

            // We only disable the checkout buttons here; render_shipping_methods() is responsible for exposing them.
            // This prevents customers from checking out before a shipping method can be selected
            var valid = !this.shipping_fields_validate(true, true);
            if (!valid || (valid && !recalculate)) {
                this.maybeDisableCheckoutButtons(valid);
            }
        },

        recalculate_shipping_and_taxes: function() {
            this.update_country_bound_fields();
            this.shipping_fields_validate(true, true);
        },

        shipping_fields_validate: function(show_errors, recalculate) {
            if (typeof(show_errors) === "undefined")
                show_errors = false;
            if (typeof(recalculate) === "undefined")
                recalculate = false;

            var i18n = Ngg_Pro_Cart_Settings.i18n;
            var $shipping_fields = $('#ngg_pro_cart_fields');
            var $fullName = $shipping_fields.find('input[name="settings[shipping_address][name]"]');
            var $email = $shipping_fields.find('input[name="settings[shipping_address][email]"]');
            var $street_address = $shipping_fields.find('input[name="settings[shipping_address][street_address]"]');
            var $address_line = $shipping_fields.find('input[name="settings[shipping_address][address_line]"]');
            var $city = $shipping_fields.find('input[name="settings[shipping_address][city]"]');
            var $country = $shipping_fields.find(':input[name="settings[shipping_address][country]"]');
            var $state = $shipping_fields.find(':input[name="settings[shipping_address][state]"]:visible');
            var $zip = $shipping_fields.find('input[name="settings[shipping_address][zip]"]');
            var $phone = $shipping_fields.find('input[name="settings[shipping_address][phone]"]');

            var getFieldName = function (field) {
                $parent = field.parentsUntil('tr', 'td.ngg-field-input').siblings('td.ngg-field-label');
                return $parent.find('label').text();
            };

            var validationError = function (field, error) {
                if (!show_errors) {
                    return;
                }

                $parent = field.parentsUntil('tr', 'td.ngg-field-input');
                $errorCont = $parent.find('.ngg-field-error-container');

                if ($errorCont.length == 0) {
                    $errorCont = $('<span class="ngg-field-error-container"></span>');
                    $icon = $('<i class="fa fa-exclamation-triangle ngg-error-icon" aria-hidden="true"></i>');
                    $errorCont.append($icon);
                    $errorCont.insertAfter(field);
                } else {
                    $errorCont.insertAfter(field);
                }

                if (field.is('input') && $.inArray(field.attr('type'), ['checkbox', 'radio']) == -1) {
                    $errorCont.addClass('ngg-field-error-container-input');
                } else {
                    $errorCont.removeClass('ngg-field-error-container-input');
                }

                if (error != '') {
                    $errorCont.attr('title', error);
                    $errorCont.css('display', 'inline');
                } else {
                    $errorCont.css('display', 'none');
                }
            };

            var err = false;
            $shipping_fields.find('.ngg-field-error-container').css('display', 'none');

            if (!$fullName.val() || $fullName.val().length === 0) {
                validationError($fullName, sprintf(i18n.error_invalid, getFieldName($fullName), 3));
                err = true;
            }

            // Validating email correctly is basically impossible. As long as the user provides
            // (anything)@(domain).(tld) we should accept it: a@g.cn is a valid address and domain (owned by Google)
            if (!$email.val() || $email.val().length < 5 || !/\S+@\S+\.\S+/.test($email.val())) {
                validationError($email, sprintf(i18n.error_invalid, getFieldName($email)));
                err = true;
            }

            if (this.model.has_shippable_items) {
                if (!$street_address.val() && !$address_line.val()) {
                    validationError($street_address, sprintf(i18n.error_empty, getFieldName($street_address)));
                    err = true;
                }

                if (!$city.val()) {
                    validationError($city, sprintf(i18n.error_empty, getFieldName($city)));
                    err = true;
                }

                if (!$country.val()) {
                    validationError($country, sprintf(i18n.error_empty, getFieldName($country)));
                    err = true;
                }

                if (!$state.val() && $state.is('select')) {
                    validationError($state, sprintf(i18n.error_empty, getFieldName($state)));
                    err = true;
                }

                // The shortest possible 'local' phone number is all of three digits. Until we can implement
                // a phone validation routine for every country the most accurate international phone number validator
                // is simply one that just checks for the existence of three digits.
                if ($phone.val().length >= 1 && !(/^\d{3,}$/).test($phone.val().replace(/[\s()+\-\.]|ext/gi, ''))) {
                    validationError($phone, sprintf(i18n.error_invalid, getFieldName($phone)));
                    err = true;
                }

                var postCodeRegex = $country.find('option[value="' + $country.val() + '"]').data('postCodeRegex');
                if (postCodeRegex != '' && !(new RegExp(postCodeRegex, 'i')).test($zip.val())) {
                    validationError($zip, sprintf(i18n.error_invalid, getFieldName($zip)));
                    err = true;
                }
            }

            if (!err && recalculate) {
                // The below debouncedLoadData() will ping the server to fetch shipping information.
                $("#ngg_pro_cart_subitems_overlay").addClass('ngg_pro_cart_subitems_overlay_open');
                var settings = this.model.settings;
                settings.shipping_address.country = $country.val();
                settings.shipping_address.state = $state.val();
                settings.shipping_address.zip = $zip.val();
                settings.shipping_address.name = $fullName.val();
                settings.shipping_address.street_address = $street_address.val();
                settings.shipping_address.address_line = $address_line.val();
                settings.shipping_address.city = $city.val();
                settings.shipping_method = null;

                this.model.settings = settings;
                this.debouncedLoadData();
            }

            return err;
        },

        debouncedLoadData: _.debounce(function() {
            this.model.loadData();
        }, 750),

        getRawCountryList: function() {
            return new Promise(function (resolve, reject) {
                try {
                    $.getJSON(Ngg_Pro_Cart_Settings.country_list_json_url, {}, function (data) {
                        resolve(data);
                    });
                }
                catch (err) {
                    reject(err);
                }
            });
        },

        maybeDisableCheckoutButtons: function(isValidShipping) {
            var $checkout_buttons = $('#ngg_pro_checkout_buttons a, #ngg_pro_checkout_buttons button, #ngg_pro_checkout_buttons input');
            if (!isValidShipping) {
                $checkout_buttons.each(function() {
                    $(this).attr('disabled', 'disabled');
                    $(this).attr('title', Ngg_Pro_Cart_Settings.i18n.error_form_invalid);
                });
            } else {
                $checkout_buttons.each(function() {
                    $(this).removeAttr('disabled');
                    $(this).attr('title', '');
                });
            }
        },

        update_country_bound_fields: function () {
            var $shipping_fields = $('#ngg_pro_cart_fields');
            var $country = $shipping_fields.find('.shipping_country');
            var country = $country.val();

            var $region_input = $shipping_fields.find('input.shipping_state');
            var $regions = $shipping_fields.find(':input');
            var $region_field = null;
            $regions.each(function (index) {
                var $this = $(this);
                var is_region = $this.data('name') == $region_input.data('name');
                var countryId = $this.data('countryId');
                if (countryId) {
                    if (countryId == country) {
                        $this.show();
                        if (is_region)
                            $region_field = $this;
                    } else {
                        if (is_region) {
                            $this.attr('id', '');
                            $this.attr('name', '');
                        }
                        $this.hide();
                    }
                }
            });

            if ($region_field != null) {
                $region_field.attr('id', $region_input.data('id')).attr('name', $region_input.data('name'));
                $region_input.hide();
            } else {
                $region_input.attr('id', $region_input.data('id')).attr('name', $region_input.data('name')).show();
            }
        },

        update_totals: function(urgent, validShipping){
            if (typeof(urgent) == 'undefined') urgent = false;
            if (typeof(validShipping) == 'undefined') validShipping = true;

            var $images_table = this.get_cart_images_el();

            // Hide/show no items message
            var $no_items = $('#ngg_pro_no_items');
            var $checkout_buttons = $('#ngg_pro_checkout_buttons');

            var empty_cart = this.model.item_count() <= 0;
            if (!empty_cart) {
                if (urgent) {
                    $images_table.show();
                    $no_items.hide();
                    $checkout_buttons.show();
                } else {
                    $images_table.fadeIn('fast');
                    $no_items.fadeOut('fast');
                    $checkout_buttons.fadeIn('fast');
                }
            } else {
                if (urgent) {
                    $images_table.hide();
                    $checkout_buttons.hide();
                    $no_items.show();
                } else {
                    $images_table.fadeOut('fast');
                    $checkout_buttons.fadeOut('fast');
                    $no_items.fadeIn('fast');
                }
            }

            // Allows gateways to hide their button if they can't handle free orders
            // TODO: is toggleClass appropriate here?
            $('#ngg_pro_checkout').toggleClass('ngg_cart_shippable_items', this.model.has_shippable_items)
                                  .toggleClass('ngg_cart_free', (parseFloat(this.model.total) == 0));

            // Update totals
            this.$el.find('#nggpl-subtotal_field').html(this.model.getFormattedCurrency('sub_total'));
            this.$el.find('#nggpl-shipping_field').html(
                validShipping ? this.model.getFormattedCurrency('shipping') : Ngg_Pro_Cart_Settings.i18n.tbd
            );
            this.$el.find('#nggpl-total_field').html(this.model.getFormattedCurrency('total'));

            // If there are no taxes we just hide this table row
            if (this.model.tax === 0) {
                this.$el.find('#tax_field_row').hide();
            } else {
                this.$el.find('#tax_field_row').show();
            }

            this.$el.find('#nggpl-tax_field').html(this.model.getFormattedCurrency('tax'));
        },

        refreshed_from_server: function(response) {
            var invalidShipping = !this.shipping_fields_validate();

            if (response && 'string' === typeof response.error && response.error.length >= 1) {
                invalidShipping = false;
                alert(response.error);
            }

            this.populate_country_list(this.country_list);
            this.shipping_fields_validate(true);

            invalidShipping = this.render_shipping_methods(invalidShipping);

            // Update totals
            this.update_totals(true, invalidShipping);

            this.toggle_shipping_fields();
        },

        refreshing_from_server: function() {
            var i18n = Ngg_Pro_Cart_Settings.i18n;
            $('#nggpl-shipping_field').text(i18n.calculating);
            var $item = $('<option/>').text(i18n.calculating)
            $('#nggpl-ship_via_field select').empty().append($item);
            $('#nggpl-tax_field').text(i18n.calculating);
        },

        render_shipping_methods: function(validShipping) {
            var $ship_via_field = $('#ship_via_row select').empty();
            var _this = this;

            if (validShipping) {
                _.each(this.model.shipping_methods, function(shipping_method) {
                    var $option = $('<option/>').val(shipping_method.name).text(shipping_method.title).attr('data-amount', shipping_method.amount);
                    if (_this.model.settings.hasOwnProperty('shipping_method') && _this.model.settings.shipping_method == shipping_method.name) {
                        $option.attr('selected', 'selected');
                    }
                    $ship_via_field.append($option);
                });
            } else {
                this.model.shipping = 0.0;
            }

            if (this.model.shipping_methods.length > 0) {
                $('#ship_via_row select').show();
                $('#unshippable_notice').hide();
                this.maybeDisableCheckoutButtons(validShipping);
            } else {
                this.model.settings.shipping_method = false;
                this.model.save();

                if (this.model.has_shippable_items) {
                    var $notice = $('#unshippable_notice');
                    validShipping ? $notice.show() : $notice.hide();
                    validShipping = false;
                }

                $('#ship_via_row select').hide();
                this.maybeDisableCheckoutButtons(validShipping);
            }

            (this.model.has_shippable_items && validShipping) ? $('#ship_via_row').show() : $('#ship_via_row').hide();

            return validShipping;
        },

        toggle_shipping_fields: function() {
            var fields = [
                $('tr.ngg-shipping-field.ngg-field-street_address'),
                $('tr.ngg-shipping-field.ngg-field-address_line'),
                $('tr.ngg-shipping-field.ngg-field-city'),
                $('tr.ngg-shipping-field.ngg-field-country'),
                $('tr.ngg-shipping-field.ngg-field-state'),
                $('tr.ngg-shipping-field.ngg-field-zip'),
                $('tr.ngg-shipping-field.ngg-field-phone'),
                $('#shipping_field_row'),
                $('#ship_via_row select')
            ];
            if (!this.model.has_shippable_items) {
                fields.forEach(function(element) {
                    element.hide();
                });
            } else {
                fields.forEach(function(element) {
                    element.show();
                });
            }
        },

        render: function() {
            var _this = this;

            $('#ship_via_row select').change(function() {
                _this.maybeDisableCheckoutButtons(false);
                $("#ngg_pro_cart_subitems_overlay").addClass('ngg_pro_cart_subitems_overlay_open');
                var settings = _this.model.settings;
                settings.shipping_method = $(this).val();
                _this.model.settings = settings;
                _this.model.loadData();
            });

            // Display images
            this.model.each(function(image){
                var $images_table = _this.get_cart_images_el();
                var items = image.get('items');
                items.each(function(item) {
                    var item_row = new Ngg_Pro_Cart.Views.Item_Row({
                        model: item,
                        collection: items,
                        image_id: image.id
                    });
                    $images_table.append(item_row.render());
                }, this);
            });

            new Ngg_Pro_Cart.Views.Coupon_Row();

            // Fix IE10
            this.fix_ie_dom();

            $('#nggpl-shipping_field').text(Ngg_Pro_Cart_Settings.i18n.tbd);

            this.toggle_shipping_fields();

            // Show the cart
            this.$el.css('visibility', 'visible');
        }
    });


    Ngg_Pro_Cart.Views.Add_To_Cart = Backbone.View.extend({
        tagName: 'div',

        id: 'ngg_add_to_cart_container',

        className: 'scrollable',

        events: function() {
            // To prevent methods being run twice when touched (thanks to browser emitting a click event as well)
            // any methods bound here should call event.stopPropogation() and event.preventDefault()
            return {
                'touchstart #ngg_checkout_btn' : 'redirect_to_checkout',
                'click #ngg_checkout_btn' : 'redirect_to_checkout',
                'touchstart .nggpl-cart_count' : 'redirect_to_checkout',
                'click .nggpl-cart_count' : 'redirect_to_checkout',
                'keyup .nggpl-quantity_field' : 'sanitize_quantity',
                'blur .nggpl-quantity_field': 'quantity_lost_focus',
                'focusout .nggpl-quantity_field': 'quantity_lost_focus',
                'touchstart #ngg_update_cart_btn': 'update_cart',
                'click #ngg_update_cart_btn': 'update_cart',
                'click .nggpl-quantity_field i': 'update_quantity'
            };
        },

        // Use -/+ buttons to adjust item quantity
        update_quantity: function(e) {
            var $target = $(e.currentTarget);
            var $input = $target.siblings('input');
            var step = $target.hasClass('fa-minus') ? -1 : 1;
            var newvalue = parseInt($input.val(), 10) + step;
            var min = parseInt($input.attr('min'), 10);
            var max = parseInt($input.attr('max'), 10);
            if (newvalue < min) { newvalue = min; }
            if (newvalue > max) { newvalue = max; }
            $input.val(newvalue);
        },

        quantity_lost_focus: function(event) {
            event.stopPropagation();
            event.preventDefault();

            this.limit_quantity($(event.target));

            // iOS does not fire this event when the onscreen keyboard is finished
            $(window).trigger('resize');
            $('.galleria-sidebar-container').focus();
        },

        getItem: function(image_id, item_id){
            var retval = null;

            _.each(
                this.tables,
                function(table){
                    if (!retval) {
                        if (table.image_id == image_id) {
                            retval = table.items.get(item_id)
                        }
                    }
                },
                this
            );

            return retval;
        },

        update_cart: function(e) {
            e.stopPropagation();
            e.preventDefault();

            var _this = this;
            $('#nggpl-items_for_sale td.nggpl-quantity_field input').each(function() {
                var item_id = $(this).parents('tr').data('item-id');
                var item = _this.getItem(_this.image_id, item_id)
                if (item) {
                    var quantity = $(this).val();
                    if (isNaN(quantity)) {
                        quantity = 0;
                    } else {
                        quantity = parseInt(quantity);
                    }
                    item.set('quantity', quantity);
                } else {
                    item = new Ngg_Pro_Cart.Models.PricelistItem({
                        ID: item_id,
                        quantity: 0
                    });
                }

                Ngg_Pro_Cart.get_instance().updateQuantity(_this.image_id, item, {loadData: false});
            });
            this.model.save();
            this.model.loadData();
        },

        // Ensures the min/max values are respected by browsers without input type=number limitations
        limit_quantity: function($input) {
            var min = parseInt($input.attr('min'), 10);
            var max = parseInt($input.attr('max'), 10);
            var curval = parseInt($input.val(), 10);
            if (curval < min) { curval = min; }
            if (curval > max) { curval = max; }
            $input.val(curval);
        },

        sanitize_quantity: function(e) {
            e.stopPropagation();

            // Only allow the following keys to be used in our
            // 8: backspace
            // 9: tab
            // 37: left arrow
            // 39: right arrow
            // 46: delete
            // 48: 0
            // 57: 9
            if (!(e.keyCode === 8 || e.keyCode === 37 || e.keyCode === 39 || e.keyCode === 9 || e.keyCode === 46 || (e.charCode >= 48 && e.charCode <= 57))) {
                e.preventDefault();
                return false;
            }

            this.limit_quantity($(e.target));

            return true;
        },

        initialize: function(params) {
            this.tables = {};
            this.image_id = params.image_id;
            this.container = params.container;
            this.datacache = params.datacache;
            this.model = Ngg_Pro_Cart.get_instance();
            this.listenTo(this.model, 'ready', this.render);
            this.listenTo(this.model, 'dataLoaded', this.update_and_animate_cart_summary);
            if (this.model.ready) {
                this.render();
            }
        },

        update_and_animate_cart_summary: function() {
            this.update_cart_summary(true);
        },

        redirect_to_checkout: function(event) {
            event.stopPropagation();
            event.preventDefault();
            var referrer = encodeURIComponent(parent.location.toString());
            var url = Ngg_Pro_Cart_Settings.checkout_url;
            if (url.indexOf('?') > 0) {
                url += "&referrer="+referrer;
            } else {
                url += "?referrer="+referrer;
            }
            parent.location = url;
        },

        update_cart_summary: function(animate) {
            var $summary = this.$el.find('.nggpl-cart_summary');
            $summary.find('.nggpl-cart_count')
                    .text(this.model.item_count() + ' items');
            $summary.find('.nggpl-cart_total')
                    .html(this.model.getFormattedCurrency('sub_total'));

            this.set_add_or_update_cart_text();

            if (animate) {
                $('#nggpl-cart_updated_wrapper').addClass('nggpl-cart_updated_wrapper_visible');
                setTimeout(function() {
                    $('#nggpl-cart_updated_wrapper').removeClass('nggpl-cart_updated_wrapper_visible');
                }, 1500);
            }
        },

        // If the cart is empty we display "Add to Cart" - otherwise "Update Cart"
        set_add_or_update_cart_text: function() {
            var $btn = $('#ngg_update_cart_btn');
            if ($btn.length > 0) {
                if (this.model.item_count() > 0) {
                    $btn.val($btn.data('update-string'));
                } else {
                    $btn.val($btn.data('add-string'));
                }
            }
        },

        render: function() {
            var image_id = this.image_id;

            this.container.empty();

            this.$el.empty();
            this.$el.attr('data-image-id', image_id);

            this.$el.append(ngg_add_to_cart_templates.add_to_cart_wrapper);
            var _this = this;

            // Update cart total
            this.update_cart_summary(false);

            // Render the tables
            this.tables = {};
            this.$el.find('.nggpl-pricelist_category_wrapper').find('.nggpl-category_contents').each(function() {
                var table = new Ngg_Pro_Cart.Views.Add_To_Cart.Items_Table({
                    image_id: image_id,
                    datacache: _this.datacache
                });
                $(this).empty().append(table.render());
                _this.tables[$(this).attr('id')] = table;
            });

            var cart = Ngg_Pro_Cart.get_instance();

            // The items currently in the cart. We will be overriding cached data with quantities from this variable
            var current_items = _.has(cart.getCartData().images, image_id) ? cart.getCartData().images[image_id].items : [];

            // Items in the cart when the XHR request was made to fetch the sidebar data for this image
            var items = _.has(this.datacache.image_items, 'items') ? this.datacache.image_items.items : [];

            // Adjust updated quantities of items still in the cart
            _.each(current_items, function(current_item, current_index) {
                _.each(items, function(item, index) {
                    if (item.ID == current_index) {
                        items[index].quantity = current_item.quantity;
                    }
                });
            });

            // Remove pricelist items from cached data no longer present in cart
            _.each(items, function(item, index) {
                if (!_.has(current_items, item.ID)) {
                    items[index].quantity = 0;
                }
            });

            // Add items to each table
            _.each(
                _.filter(items, function(item) {
                    return item.title !== ""; }
                ),
                function(item) {
                    _this.tables[item.category].items.add(item);
                },
                _this
            );

            // Set the generated content so we can inspect and manipulate it further
            this.container.append(this.el);

            // Hide headers for categories without items
            _.each(_this.tables, function(table) {
                var id = table.$el.parent().attr('id');
                var $header = $('#' + id + '_header').parent();
                if (_this.tables[id].items.length === 0) {
                    $header.hide();
                } else {
                    var $link = $('<h3>' + $header.html() + '</h3>');
                    $('#nggpl-category-headers').append($link);
                    $link.on('click', function() {
                        $('#npl_sidebar').animate({ scrollTop: $header.position().top });
                    });
                }
            }, _this);

            // Are there items?
            if (items.length > 0) {
                _this.$el.find('#nggpl-not_for_sale').css('display', 'none');
                _this.$el.find('#nggpl-items_for_sale').css('display', 'inline-block');
            } else {
                _this.$el.find('#nggpl-items_for_sale').css('display', 'none');
                _this.$el.find('#nggpl-not_for_sale').css('display', 'block');
            }

            if ($.nplModal('get_setting', 'sidebar_button_color')) {
                _this.$el.find('#ngg_checkout_btn, #ngg_update_cart_btn').css({'color': $.nplModal('get_setting', 'sidebar_button_color')});
            }
            if ($.nplModal('get_setting', 'sidebar_button_background')) {
                _this.$el.find('#ngg_checkout_btn, #ngg_update_cart_btn').css({'background-color': $.nplModal('get_setting', 'sidebar_button_background')});
            }

            this.set_add_or_update_cart_text();

            // Updates the sidebar image thumbnail for low width browsers
            $('#npl_content').trigger('npl_sidebar_rendered');

            $('#nggpl-cart_sidebar_checkout_buttons, #nggpl-cart-static-header').css({
                background: $.nplModal('get_setting', 'sidebar_background_color')
            });

            // Images not for sale won't have this cache entry
            if (typeof _this.datacache.digital_download_settings !== 'undefined') {
                // The full selector here is *necessary* : the (pricelist_category)_header ID is present more than once!
                $('.nggpl-pricelist_category_wrapper #ngg_category_digital_downloads_header').html(
                    _this.datacache.digital_download_settings.header
                );
            }

            cart.trigger('rendered');
            $('#npl_wrapper').removeClass('npl-sidebar-overlay-open');
        }
    });

    Ngg_Pro_Cart.Views.Add_To_Cart.Items_Table = Backbone.View.extend({
        tagName: 'table',

        class: 'items_table',

        initialize: function(params) {
            this.image_id = params.image_id;
            this.datacache = params.datacache;
            this.items = new Ngg_Pro_Cart.Models.PricelistItemCollection();
            this.items.on('add', this.render_row, this);
        },

        render: function() {
            this.$el.hide();
            this.$el.html(ngg_add_to_cart_templates.add_to_cart_header);
            this.$el.attr('data-image-id', this.image_id);
            return this.el;
        },

        render_row: function(item) {
            var row = new Ngg_Pro_Cart.Views.Add_To_Cart.Item_Row({
                model: item,
                image_id: this.image_id,
                datacache: this.datacache
            });
            this.$el.find('tbody').append(row.render());
            this.$el.show();
        }
    });

    Ngg_Pro_Cart.Views.Add_To_Cart.Item_Row = Backbone.View.extend({
        tagName: 'tr',

        events: {
            'updated_quantity input': 'update_quantity',
            'click .nggpl-add-download-button': 'update_download_items'
        },

        initialize: function(params) {
            this.image_id = params.image_id;
            this.datacache = params.datacache;
            this.model.on('change:quantity', this.update_subtotal, this);
            this.skip_checkout = (this.datacache.digital_download_settings.skip_checkout === '1');
        },

        update_download_items: function() {
            var price = this.model.get('price');
            var button = this.$el.find('.nggpl-add-download-button');

            if (price === 0 && this.skip_checkout) {
                var url = Ngg_Pro_Cart.get_ajax_url();
                url += '&action=get_image_file';
                url += '&image_id=' + this.image_id;
                url += '&item_id=' + this.model.get('ID');

                // We do not need to specify the 'download' filename / attribute here because that is provided
                // by the XHR controller via the Content-Disposition header which takes priority
                var anchor = document.createElement("a");
                anchor.style.display = 'none';
                anchor.href = url;
                document.body.appendChild(anchor);
                anchor.click();
                document.body.removeChild(anchor);
                delete anchor;

            } else {
                if (this.model.get('quantity') === 0) {
                    button.html(button.data('remove-text'));
                    this.model.set('quantity', 1);
                } else {
                    button.html(button.data('add-text'));
                    this.model.set('quantity', 0);
                }

                Ngg_Pro_Cart.get_instance().updateQuantity(this.image_id, this.model);
            }
        },

        render: function() {
            var price = this.model.get('price');

            // Download items do not need a quantity input, just "buy / don't buy"
            if (this.model.get('source') === 'ngg_digital_downloads') {
                this.$el.html(ngg_add_to_cart_templates.add_to_cart_download_item);
                var button = this.$el.find('.nggpl-add-download-button');
                if (price === 0 && this.skip_checkout) {
                    button.html(button.data('free-text'));
                } else {
                    if (this.model.get('quantity') > 0) {
                        button.html(button.data('remove-text'));
                    }
                }
            } else {
                this.$el.html(ngg_add_to_cart_templates.add_to_cart_normal_item);
            }

            this.$el.attr('data-item-id', this.model.id);
            this.$el.find('.nggpl-quantity_field input').val(this.model.get('quantity'));
            this.$el.find('.nggpl-description_field').text(this.model.get('title'));

            var price_field = this.$el.find('.nggpl-price_field');
            if (price === 0 && this.skip_checkout) {
                price_field.html(price_field.data('free-label'));
            } else {
                price_field.html(sprintf(Ngg_Pro_Cart_Settings.currency_format, price));
            }

            this.$el.find('.nggpl-total_field').html(sprintf(Ngg_Pro_Cart_Settings.currency_format, this.model.subtotal()));

            return this.el;
        },

        update_quantity: function(e, options) {
            var quantity = $(e.target).val();
            if (isNaN(quantity)) {
                quantity = 0;
            } else {
                quantity = parseInt(quantity);
            }

            this.model.set('quantity', quantity);
            Ngg_Pro_Cart.get_instance().updateQuantity(this.image_id, this.model, options);
        },

        update_subtotal: function() {
            this.$el.find('.nggpl-total_field')
                .html(sprintf(Ngg_Pro_Cart_Settings.currency_format, this.model.subtotal()));
        }
    });

    if (typeof(window.Ngg_Pro_Cart) !== "undefined") {
        window.Ngg_Pro_Cart.get_instance().on('dataLoaded', function () {
            $('i.nextgen-menu-cart-icon').each(function (index) {
                var $this = $(this);
                var show_cart_icon = false;
                var $menu_item = $this.parents('li');
                var placeholder = $menu_item.find('.nextgen-menu-cart-placeholder');

                if (($this.hasClass('nextgen-menu-cart-icon-icon_and_total_with_items') || $this.hasClass('nextgen-menu-cart-icon-icon_with_items')) && Ngg_Pro_Cart.get_instance().subtotal() > 0) {
                    show_cart_icon = true;
                } else if ($this.hasClass('nextgen-menu-cart-icon-icon_and_total') || $this.hasClass('nextgen-menu-cart-icon-icon')) {
                    show_cart_icon = true;
                }

                if (placeholder.size() > 0) {
                    placeholder.html(' (' + Ngg_Pro_Cart.get_instance().getFormattedCurrency('sub_total') + ')');
                }

                if (show_cart_icon) {
                    $this.show();
                    $menu_item.show();
                } else {
                    $menu_item.hide();
                }
            });
        });
    }

})(jQuery);