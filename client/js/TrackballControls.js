/**
 * @author Eberhard Graether / http://egraether.com/
 * @author Mark Lundin  / http://mark-lundin.com
 * @author Simone Manini / http://daron1337.github.io
 * @author Luca Antiga  / http://lantiga.github.io
 */

// ESLint global declarations: https://eslint.org/docs/rules/no-undef
/*
global config:true,
 ZOR:true,
 UTIL:true,
 THREE:true,
 _:true
*/

THREE.TrackballControls = function( object, domElement ) {
    let _this = this;
    let STATE = { NONE: - 1, ROTATE: 0, ZOOM: 1, PAN: 2, TOUCH_ROTATE: 3, TOUCH_ZOOM_PAN: 4 };

    this.object = object;
    this.domElement = ( domElement !== undefined ) ? domElement : document;

    // API

    this.enabled = true;

    this.screen = { left: 0, top: 0, width: 0, height: 0 };

    this.rotateSpeed = 1.0;
    this.zoomSpeed = 1.2;
    this.panSpeed = 0.3;

    this.noRotate = false;
    this.noZoom = false;
    this.noPan = false;

    this.staticMoving = false;
    this.dynamicDampingFactor = 0.0;

    this.minDistance = 0;
    this.maxDistance = Infinity;

    this.keys = [65 /* A */, 83 /* S */, 68];

    this.velocityRequest = new THREE.Vector3();

    // internals

    this.target = new THREE.Vector3();
    this.follow_controls_on = config.STEERING.NAME === 'FOLLOW';

    let EPS = 0.000001;

    let lastPosition = new THREE.Vector3();

    let _state     = STATE.NONE;
    let _prevState = STATE.NONE;

    let _eye = new THREE.Vector3();

    let _movePrev = new THREE.Vector2();
    let _moveCurr = new THREE.Vector2();

    let _lastAxis  = new THREE.Vector3();
    let _lastAngle = 0;

    let _zoomStart = new THREE.Vector2();
    let _zoomEnd   = new THREE.Vector2();

    let _touchZoomDistanceStart = 0;
    let _touchZoomDistanceEnd   = 0;
    let _panStart               = new THREE.Vector2();
    let _panEnd                 = new THREE.Vector2();

    // for reset

    this.target0 = this.target.clone();
    this.position0 = this.object.position.clone();
    this.up0 = this.object.up.clone();

    // events

    let changeEvent = { type: 'change' };
    let startEvent = { type: 'start' };
    let endEvent = { type: 'end' };


    // methods

    this.handleResize = function() {
        if ( this.domElement === document ) {
            this.screen.left = 0;
            this.screen.top = 0;
            this.screen.width = window.innerWidth;
            this.screen.height = window.innerHeight;
        }
        else {
            let box = this.domElement.getBoundingClientRect();
            // adjustments come from similar code in the jquery offset() function
            let d = this.domElement.ownerDocument.documentElement;
            this.screen.left = box.left + window.pageXOffset - d.clientLeft;
            this.screen.top = box.top + window.pageYOffset - d.clientTop;
            this.screen.width = box.width;
            this.screen.height = box.height;
        }
    };

    this.handleEvent = function( event ) {
        if ( typeof this[event.type] === 'function' ) {
            this[event.type]( event );
        }
    };

    let getMouseOnScreen = ( function() {
        let vector = new THREE.Vector2();

        return function getMouseOnScreen( pageX, pageY ) {
            vector.set(
                config.X_AXIS_MULT * ( pageX - _this.screen.left ) / _this.screen.width,
                config.Y_AXIS_MULT * ( pageY - _this.screen.top ) / _this.screen.height
            );

            return vector;
        };
    }() );

    this.getMouseOnCircle = ( function() {
        let vector = new THREE.Vector2();

        return function getMouseOnCircle(pageX, pageY) {
            let x = config.X_AXIS_MULT
                * ((pageX - _this.screen.width * 0.5 - _this.screen.left) / (_this.screen.width * 0.5));
            let y = config.Y_AXIS_MULT
                * ((_this.screen.height + 2 * (_this.screen.top - pageY)) / _this.screen.width );  // screen.width intentional
            vector.set(x, y);
            return vector;
        };
    }() );

    this.rotateCamera = ( function() {
        let axis                    = new THREE.Vector3();
        let quaternion              = new THREE.Quaternion();
        let eyeDirection            = new THREE.Vector3();
        let objectUpDirection       = new THREE.Vector3();
        let objectSidewaysDirection = new THREE.Vector3();
        let moveDirection           = new THREE.Vector3();
        let spin                    = new THREE.Vector2();
        let angle                   = 0;

        return function rotateCamera() {
            if (_this.follow_controls_on) {
                spin.set( _moveCurr.x, _moveCurr.y );

                let dist_from_center = spin.length();

                spin.normalize().multiplyScalar( UTIL.slopewell( dist_from_center ) );
                moveDirection.set( spin.x, spin.y, 0 );
                _movePrev.set( 0, 0 );
                angle += moveDirection.length() * ZOR.LagScale.get();
            }
            else {
                moveDirection.set( _moveCurr.x - _movePrev.x, _moveCurr.y - _movePrev.y, 0 );
                angle = moveDirection.length();
            }

            if ( angle ) {
                _eye.copy( _this.object.position ).sub( _this.target );

                eyeDirection.copy( _eye ).normalize();
                objectUpDirection.copy( _this.object.up ).normalize();
                objectSidewaysDirection.crossVectors( objectUpDirection, eyeDirection ).normalize();

                objectUpDirection.setLength( _moveCurr.y - _movePrev.y );
                objectSidewaysDirection.setLength( _moveCurr.x - _movePrev.x );

                moveDirection.copy( objectUpDirection.add( objectSidewaysDirection ) );

                axis.crossVectors( moveDirection, _eye ).normalize();

                angle *= _this.rotateSpeed;
                quaternion.setFromAxisAngle( axis, angle );

                _eye.applyQuaternion( quaternion );
                _this.object.up.applyQuaternion( quaternion );

                _lastAxis.copy( axis );
                _lastAngle = angle;
            }
            else if ( ! _this.staticMoving && _lastAngle ) {
                _lastAngle *= Math.sqrt( 1.0 - _this.dynamicDampingFactor );
                _eye.copy( _this.object.position ).sub( _this.target );
                quaternion.setFromAxisAngle( _lastAxis, _lastAngle );
                _eye.applyQuaternion( quaternion );
                _this.object.up.applyQuaternion( quaternion );
            }

            _movePrev.copy( _moveCurr );
        };
    }() );


    this.zoomCamera = function() {
        let factor;

        if ( _state === STATE.TOUCH_ZOOM_PAN ) {
            factor = _touchZoomDistanceStart / _touchZoomDistanceEnd;
            _touchZoomDistanceStart = _touchZoomDistanceEnd;
            _eye.multiplyScalar( factor );
        }
        else {
            factor = 1.0 + ( _zoomEnd.y - _zoomStart.y ) * _this.zoomSpeed;

            if ( factor !== 1.0 && factor > 0.0 ) {
                _eye.multiplyScalar( factor );

                if ( _this.staticMoving ) {
                    _zoomStart.copy( _zoomEnd );
                }
                else {
                    _zoomStart.y += ( _zoomEnd.y - _zoomStart.y ) * this.dynamicDampingFactor;
                }
            }
        }
    };

    this.panCamera = ( function() {
        let mouseChange = new THREE.Vector2();
        let objectUp    = new THREE.Vector3();
        let pan         = new THREE.Vector3();

        return function panCamera() {
            mouseChange.copy( _panEnd ).sub( _panStart );

            if ( mouseChange.lengthSq() ) {
                mouseChange.multiplyScalar( _eye.length() * _this.panSpeed );

                pan.copy( _eye ).cross( _this.object.up ).setLength( mouseChange.x );
                pan.add( objectUp.copy( _this.object.up ).setLength( mouseChange.y ) );

                _this.object.position.add( pan );
                _this.target.add( pan );

                if ( _this.staticMoving ) {
                    _panStart.copy( _panEnd );
                }
                else {
                    _panStart.add( mouseChange.subVectors( _panEnd, _panStart )
                        .multiplyScalar( _this.dynamicDampingFactor ) );
                }
            }
        };
    }() );

    this.checkDistances = function() {
        if ( ! _this.noZoom || ! _this.noPan ) {
            if ( _eye.lengthSq() > _this.maxDistance * _this.maxDistance ) {
                _this.object.position.addVectors( _this.target, _eye.setLength( _this.maxDistance ) );
                _zoomStart.copy( _zoomEnd );
            }

            if ( _eye.lengthSq() < _this.minDistance * _this.minDistance ) {
                _this.object.position.addVectors( _this.target, _eye.setLength( _this.minDistance ) );
                _zoomStart.copy( _zoomEnd );
            }
        }
    };

    this.update = function() {
        _eye.subVectors( _this.object.position, _this.target );

        if ( ! _this.noRotate ) {
            _this.rotateCamera();
        }

        if ( ! _this.noZoom ) {
            _this.zoomCamera();
        }

        if ( ! _this.noPan ) {
            _this.panCamera();
        }

        _this.object.position.addVectors( _this.target, _eye );

        _this.checkDistances();

        _this.object.lookAt( _this.target );

        if ( lastPosition.distanceToSquared( _this.object.position ) > EPS ) {
            _this.dispatchEvent( changeEvent );

            lastPosition.copy( _this.object.position );
        }
    };

    this.reset = function() {
        _state = STATE.NONE;
        _prevState = STATE.NONE;

        _this.target.copy( _this.target0 );
        _this.object.position.copy( _this.position0 );
        _this.object.up.copy( _this.up0 );

        _eye.subVectors( _this.object.position, _this.target );

        _this.object.lookAt( _this.target );

        _this.dispatchEvent( changeEvent );

        lastPosition.copy( _this.object.position );
    };

    // listeners

    /**
     * handle key down
     * @param {Object} event
     */
    function keydown( event ) {
        if ( _this.enabled === false ) return;

        window.removeEventListener( 'keydown', keydown );

        _prevState = _state;

        if ( _state !== STATE.NONE ) {
            return;
        }
        else if ( event.keyCode === _this.keys[STATE.ROTATE] && ! _this.noRotate ) {
            _state = STATE.ROTATE;
        }
        else if ( event.keyCode === _this.keys[STATE.ZOOM] && ! _this.noZoom ) {
            _state = STATE.ZOOM;
        }
        else if ( event.keyCode === _this.keys[STATE.PAN] && ! _this.noPan ) {
            _state = STATE.PAN;
        }
    }

    /**
     * handle key up
     */
    function keyup() {
        if ( _this.enabled === false ) return;

        _state = _prevState;

        window.addEventListener( 'keydown', keydown, false );
    }

    /**
     * handle mouse down
     * @param {Object} event
     */
    function mousedown( event ) {
        if ( _this.enabled === false ) return;

        event.preventDefault();
        // event.stopPropagation();

        if ( _state === STATE.NONE ) {
            _state = event.button;
        }

        if ( _state === STATE.ROTATE && ! _this.noRotate ) {
            _moveCurr.copy( _this.getMouseOnCircle( event.pageX, event.pageY ) );
            _movePrev.copy( _moveCurr );
        }
        else if ( _state === STATE.ZOOM && ! _this.noZoom ) {
            _zoomStart.copy( getMouseOnScreen( event.pageX, event.pageY ) );
            _zoomEnd.copy( _zoomStart );
        }
        else if ( _state === STATE.PAN && ! _this.noPan ) {
            _panStart.copy( getMouseOnScreen( event.pageX, event.pageY ) );
            _panEnd.copy( _panStart );
        }

        if (!_this.follow_controls_on) {
            document.addEventListener( 'mousemove', mousemove, false );
            document.addEventListener( 'mouseup', mouseup, false );
        }

        _this.dispatchEvent( startEvent );
    }

    /**
     * handle mouse move
     * @param {Object} event
     */
    function mousemove( event ) {
        if ( _this.enabled === false ) return;

        event.preventDefault();
        // event.stopPropagation();

        if ( _state === STATE.ROTATE && ! _this.noRotate || _this.follow_controls_on ) {
            _movePrev.copy( _moveCurr );
            _moveCurr.copy( _this.getMouseOnCircle( event.pageX, event.pageY ) );
        }
        else if ( _state === STATE.ZOOM && ! _this.noZoom ) {
            _zoomEnd.copy( getMouseOnScreen( event.pageX, event.pageY ) );
        }
        else if ( _state === STATE.PAN && ! _this.noPan ) {
            _panEnd.copy( getMouseOnScreen( event.pageX, event.pageY ) );
        }
    }

    /**
     * handle mouse up
     * @param {Object} event
     */
    function mouseup( event ) {
        if ( _this.enabled === false ) return;

        event.preventDefault();
        // event.stopPropagation();

        _state = STATE.NONE;

        if (!_this.follow_controls_on) {
            document.removeEventListener( 'mousemove', mousemove );
            document.removeEventListener( 'mouseup', mouseup );
        }
        _this.dispatchEvent( endEvent );
    }

    /**
     * Handle mouse wheel
     * @param {Object} event
     */
    function mousewheel( event ) {
        if ( _this.enabled === false ) return;

        event.preventDefault();
        // event.stopPropagation();

        let delta = 0;

        if ( event.wheelDelta ) {
            // WebKit / Opera / Explorer 9

            delta = event.wheelDelta / 40;
        }
        else if ( event.detail ) {
            // Firefox

            delta = - event.detail / 3;
        }

        _zoomStart.y += delta * 0.01;
        _this.dispatchEvent( startEvent );
        _this.dispatchEvent( endEvent );
    }

    /**
     * handle touch start
     * @param {Object} event
     */
    function touchstart( event ) {
        if ( _this.enabled === false ) return;

        switch ( event.touches.length ) {
            case 1:
                _state = STATE.TOUCH_ROTATE;
                _moveCurr.copy( _this.getMouseOnCircle( event.touches[0].pageX, event.touches[0].pageY ) );
                _movePrev.copy( _moveCurr );
                break;

            case 2: {
                _state = STATE.TOUCH_ZOOM_PAN;
                const dx = event.touches[0].pageX - event.touches[1].pageX;
                const dy = event.touches[0].pageY - event.touches[1].pageY;
                _touchZoomDistanceEnd = _touchZoomDistanceStart = Math.sqrt( dx * dx + dy * dy );

                const x = ( event.touches[0].pageX + event.touches[1].pageX ) / 2;
                const y = ( event.touches[0].pageY + event.touches[1].pageY ) / 2;
                _panStart.copy( getMouseOnScreen( x, y ) );
                _panEnd.copy( _panStart );
                break;
            }

            default:
                _state = STATE.NONE;
        }
        _this.dispatchEvent( startEvent );
    }

    /**
     * Handle touch move
     * @param {Object} event
     */
    function touchmove( event ) {
        if ( _this.enabled === false ) return;

        event.preventDefault();
        // event.stopPropagation();

        switch ( event.touches.length ) {
            case 1:
                _movePrev.copy( _moveCurr );
                _moveCurr.copy( _this.getMouseOnCircle(  event.touches[0].pageX, event.touches[0].pageY ) );
                break;

            case 2: {
                const dx = event.touches[0].pageX - event.touches[1].pageX;
                const dy = event.touches[0].pageY - event.touches[1].pageY;
                _touchZoomDistanceEnd = Math.sqrt( dx * dx + dy * dy );

                const x = ( event.touches[0].pageX + event.touches[1].pageX ) / 2;
                const y = ( event.touches[0].pageY + event.touches[1].pageY ) / 2;
                _panEnd.copy( getMouseOnScreen( x, y ) );
                break;
            }
            default:
                _state = STATE.NONE;
        }
    }

    /**
     * Handle touch end
     * @param {Object} event
     */
    function touchend( event ) {
        if ( _this.enabled === false ) return;

        switch ( event.touches.length ) {
            case 1:
                _movePrev.copy( _moveCurr );
                _moveCurr.copy( _this.getMouseOnCircle(  event.touches[0].pageX, event.touches[0].pageY ) );
                break;

            case 2: {
                _touchZoomDistanceStart = _touchZoomDistanceEnd = 0;

                const x = ( event.touches[0].pageX + event.touches[1].pageX ) / 2;
                const y = ( event.touches[0].pageY + event.touches[1].pageY ) / 2;
                _panEnd.copy( getMouseOnScreen( x, y ) );
                _panStart.copy( _panEnd );
                break;
            }
        }

        _state = STATE.NONE;
        _this.dispatchEvent( endEvent );
    }

    /**
     * context menu
     * @param {Object} event
     */
    function contextmenu( event ) {
        event.preventDefault();
    }

    this.dispose = function() {
        this.domElement.removeEventListener( 'contextmenu', contextmenu, false );
        this.domElement.removeEventListener( 'mousedown', mousedown, false );
        this.domElement.removeEventListener( 'mousewheel', mousewheel, false );
        this.domElement.removeEventListener( 'MozMousePixelScroll', mousewheel, false ); // firefox

        this.domElement.removeEventListener( 'touchstart', touchstart, false );
        this.domElement.removeEventListener( 'touchend', touchend, false );
        this.domElement.removeEventListener( 'touchmove', touchmove, false );

        document.removeEventListener( 'mousemove', mousemove, false );
        document.removeEventListener( 'mouseup', mouseup, false );

        window.removeEventListener( 'keydown', keydown, false );
        window.removeEventListener( 'keyup', keyup, false );
    };

    this.domElement.addEventListener( 'contextmenu', contextmenu, false );

    if (!this.follow_controls_on) {
        this.domElement.addEventListener( 'mousedown', mousedown, false );
    }

    this.domElement.addEventListener( 'mousemove', mousemove, false );
    this.domElement.addEventListener( 'mousewheel', mousewheel, false );
    this.domElement.addEventListener( 'MozMousePixelScroll', mousewheel, false ); // firefox

    this.domElement.addEventListener( 'touchstart', touchstart, false );
    this.domElement.addEventListener( 'touchend', touchend, false );
    this.domElement.addEventListener( 'touchmove', touchmove, false );

    window.addEventListener( 'keydown', keydown, false );
    window.addEventListener( 'keyup', keyup, false );
    window.addEventListener( 'resize', _.throttle( this.handleResize.bind(this), 50 ) );

    this.handleResize();

    // force an update at start
    this.update();
};

THREE.TrackballControls.prototype = Object.create( THREE.EventDispatcher.prototype );
THREE.TrackballControls.prototype.constructor = THREE.TrackballControls;

