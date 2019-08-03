import Dropzone from 'dropzone'

export default {
    methods: {
        /*                Upload                */
        fileUpload() {
            let uploaded = 0
            let allFiles = 0
            let uploadProgress = 0

            let manager = this
            let last = null
            let clearCache = false
            let uploadPreview = '#uploadPreview'
            let uploadsize = this.restrict.uploadsize ? this.restrict.uploadsize : 256
            let uploadTypes = this.restrict.uploadTypes ? this.restrict.uploadTypes.join(', ') : null
            let autoProcess = this.config.previewFilesBeforeUpload
                ? {
                    autoProcessQueue: false,
                    maxThumbnailFilesize: 25,
                    createImageThumbnails: true,
                    addRemoveLinks: true,
                    dictRemoveFile: '<button class="button is-danger"><span>✘</span></button>',
                    init: function () {
                        let previewContainer = document.querySelector(uploadPreview)

                        // cancel pending upload
                        EventHub.listen('clear-pending-upload', this.removeAllFiles(true))

                        this.on('removedfile', (file) => {
                            if (!this.files.length) {
                                manager.clearUploadPreview(previewContainer)
                            }
                        })

                        this.on('addedfile', (file) => {
                            // remove duplicate files from selection
                            // https://stackoverflow.com/a/32890783/3574919
                            if (this.files.length) {
                                let _i = 0
                                let _len = this.files.length - 1 // -1 to exclude current file
                                for (_i; _i < _len; _i++) {
                                    if (this.files[_i] === file) {
                                        this.removeFile(file)
                                    }
                                }
                            }

                            // add file to list so we can freely manipulate it later
                            manager.selectedUploadPreviewList.push(file)
                            // toggle stuff
                            manager.UploadArea = false
                            manager.toolBar = false
                            manager.infoSidebar = false
                            manager.waitingForUpload = true

                            let el = file.previewElement
                            el.classList.add('is-hidden')
                            previewContainer.classList.add('show')

                            // get around https://www.dropzonejs.com/#config-maxThumbnailFilesize
                            // note: width & height wont be generated as well
                            if (!file.dataURL) {
                                let img = el.querySelector('img')
                                img.src = './assets/vendor/MediaManager/noPreview.jpg'
                                img.style.height = '120px'
                                img.style.width = '120px'

                                el.dataset.index = this.files.indexOf(file)
                                el.classList.remove('is-hidden')
                            }
                        })

                        this.on('thumbnail', (file, dataUrl) => {
                            file.previewElement.classList.remove('is-hidden')
                        })

                        // reset dz
                        manager.$refs['clear-dropzone'].addEventListener('click', () => {
                            this.removeAllFiles()
                            manager.clearUploadPreview(previewContainer)
                        })
                        // start the upload
                        manager.$refs['process-dropzone'].addEventListener('click', () => {
                            this.processQueue()
                            manager.clearUploadPreview(previewContainer)
                        })
                    }
                }
                : {}

            let options = {
                url: manager.routes.upload,
                parallelUploads: 10,
                hiddenInputContainer: '#new-upload',
                uploadMultiple: true,
                forceFallback: false,
                acceptedFiles: uploadTypes,
                maxFilesize: uploadsize,
                headers: {
                    'X-Socket-Id': manager.browserSupport('Echo') ? Echo.socketId() : null,
                    'X-CSRF-Token': document.querySelector('meta[name="csrf-token"]').getAttribute('content')
                },
                timeout: 3600000, // 60 mins
                autoProcessQueue: true,
                previewsContainer: `${uploadPreview} .sidebar`,
                accept: function (file, done) {
                    if (this.getUploadingFiles().length) {
                        return done(manager.trans('upload_in_progress'))
                    }

                    allFiles++
                    done()
                },
                sending(file, xhr, formData) {
                    uploadProgress += parseFloat(100 / allFiles)
                    manager.progressCounter = `${Math.round(uploadProgress)}%`

                    formData.append('upload_path', manager.files.path)
                    formData.append('random_names', manager.randomNames)
                },
                processingmultiple() {
                    manager.showProgress = true
                },
                successmultiple(files, res) {
                    res.map((item) => {
                        uploaded++

                        if (item.success) {
                            clearCache = true
                            last = item.file_name
                            manager.showNotif(`${manager.trans('upload_success')} "${item.file_name}"`)
                        } else {
                            manager.showNotif(item.message, 'danger')
                        }
                    })
                },
                errormultiple(file, res) {
                    file = Array.isArray(file) ? file[0] : file
                    manager.showNotif(`"${file.name}" ${res}`, 'danger')
                    this.removeFile(file)
                },
                queuecomplete: function () {
                    if (uploaded == this.files.length) {
                        manager.progressCounter = '100%'
                        manager.hideProgress()

                        if (clearCache) {
                            manager.removeCachedResponse().then(() => {
                                last
                                    ? manager.getFiles(manager.folders, null, last)
                                    : manager.getFiles(manager.folders)
                            })
                        }
                    }
                }
            }

            options = Object.assign(options, autoProcess)

            // upload panel
            new Dropzone('#new-upload', options)
            // drag & drop on empty area
            new Dropzone('.__stack-container', Object.assign(options, {
                clickable: false
            }))
        },
        clearUploadPreview(previewContainer) {
            previewContainer.classList.remove('show')
            this.$nextTick(() => {
                this.waitingForUpload = false
                this.toolBar = true
                this.selectedUploadPreviewList = []
                this.selectedUploadPreview = {}
            })
        },
        updateDropZoneFile(i, data) {
            Dropzone.instances.some((item) => {
                let files = item.files
                if (files.length) {
                    files[i].width = data.width
                    return files[i].height = data.height
                }
            })
        },
        changeUploadPreviewFile(e) {
            e.stopPropagation()

            let index = e.target.closest('.dz-preview').dataset.index
            let file = this.selectedUploadPreviewList[index]
            this.selectedUploadPreview = {
                img: file.dataURL,
                index: index,
                width: file.width,
                height: file.height
            }
        },

        // upload image from link
        saveLinkForm(event) {
            let url = this.urlToUpload

            if (!url) {
                return this.showNotif(this.trans('no_val'), 'warning')
            }

            this.UploadArea = false
            this.toggleLoading()
            this.loadingFiles('show')

            this.$nextTick(() => {
                axios.post(event.target.action, {
                    path: this.files.path,
                    url: url,
                    random_names: this.randomNames
                }).then(({data}) => {
                    this.toggleLoading()
                    this.loadingFiles('hide')

                    if (!data.success) {
                        return this.showNotif(data.message, 'danger')
                    }

                    this.resetInput('urlToUpload')
                    this.$nextTick(() => {
                        this.$refs.save_link_modal_input.focus()
                    })

                    this.showNotif(`${this.trans('save_success')} "${data.message}"`)
                    this.removeCachedResponse().then(() => {
                        this.getFiles(this.folders, null, data.message)
                    })

                }).catch((err) => {
                    console.error(err)

                    this.toggleLoading()
                    this.toggleModal()
                    this.loadingFiles('hide')
                    this.ajaxError()
                })
            })
        }
    }
}
