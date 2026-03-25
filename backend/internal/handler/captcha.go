package handler

import (
	"image/color"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/mojocn/base64Captcha"

	"github.com/raids-lab/crater/internal/resputil"
)

//nolint:gochecknoinits // This is the standard way to register a gin handler.
func init() {
	Registers = append(Registers, NewCaptchaMgr)
}

type CaptchaMgr struct {
	name  string
	store *CaptchaStore
}

const captchaExpireMinutes = 5 * time.Minute

func NewCaptchaMgr(_ *RegisterConfig) Manager {
	mgr := &CaptchaMgr{
		name:  "captcha",
		store: NewCaptchaStore(captchaExpireMinutes), // CAPTCHA expires in 5 minutes
	}
	SetGlobalCaptchaMgr(mgr)
	return mgr
}

func (mgr *CaptchaMgr) GetName() string { return mgr.name }

func (mgr *CaptchaMgr) RegisterPublic(g *gin.RouterGroup) {
	g.GET("generate", mgr.GenerateCaptcha)
}

func (mgr *CaptchaMgr) RegisterProtected(_ *gin.RouterGroup) {}

func (mgr *CaptchaMgr) RegisterAdmin(_ *gin.RouterGroup) {}

// CaptchaStore implements base64Captcha.Store interface with expiration
type CaptchaStore struct {
	data map[string]*CaptchaItem
	mu   sync.RWMutex
	ttl  time.Duration
}

type CaptchaItem struct {
	value     string
	expiresAt time.Time
}

func NewCaptchaStore(ttl time.Duration) *CaptchaStore {
	store := &CaptchaStore{
		data: make(map[string]*CaptchaItem),
		ttl:  ttl,
	}
	// Clean up expired captchas every minute
	go func() {
		ticker := time.NewTicker(time.Minute)
		defer ticker.Stop()
		for range ticker.C {
			store.cleanup()
		}
	}()
	return store
}

func (s *CaptchaStore) Set(id, value string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.data[id] = &CaptchaItem{
		value:     value,
		expiresAt: time.Now().Add(s.ttl),
	}
	return nil
}

func (s *CaptchaStore) Get(id string, myclear bool) string {
	s.mu.Lock()
	defer s.mu.Unlock()
	item, exists := s.data[id]
	if !exists {
		return ""
	}
	// Check if expired
	if time.Now().After(item.expiresAt) {
		delete(s.data, id)
		return ""
	}
	value := item.value
	if myclear {
		delete(s.data, id)
	}
	return value
}

func (s *CaptchaStore) Verify(id, answer string, myclear bool) bool {
	value := s.Get(id, myclear)
	return value != "" && value == answer
}

func (s *CaptchaStore) cleanup() {
	s.mu.Lock()
	defer s.mu.Unlock()
	now := time.Now()
	for id, item := range s.data {
		if now.After(item.expiresAt) {
			delete(s.data, id)
		}
	}
}

type GenerateCaptchaResp struct {
	CaptchaID string `json:"captchaId"`
	ImageData string `json:"imageData"` // Base64 encoded image
}

// GenerateCaptcha godoc
//
//	@Summary		生成图形验证码
//	@Description	生成一个新的图形验证码，返回验证码ID和Base64编码的图片
//	@Tags			Auth
//	@Accept			json
//	@Produce		json
//	@Success		200	{object}	resputil.Response[GenerateCaptchaResp]	"验证码生成成功"
//	@Failure		500	{object}	resputil.Response[any]					"生成验证码失败"
//	@Router			/captcha/generate [get]
func (mgr *CaptchaMgr) GenerateCaptcha(c *gin.Context) {
	// Configure captcha driver
	driver := &base64Captcha.DriverString{
		Height:          80,
		Width:           240,
		NoiseCount:      0,
		ShowLineOptions: base64Captcha.OptionShowHollowLine | base64Captcha.OptionShowSlimeLine,
		Length:          4,
		Source:          "0123456789",
		BgColor: &color.RGBA{
			R: 240,
			G: 240,
			B: 246,
			A: 255,
		},
		Fonts: []string{"wqy-microhei.ttc"},
	}
	// Create captcha
	captcha := base64Captcha.NewCaptcha(driver, mgr.store)
	id, b64s, _, err := captcha.Generate()
	if err != nil {
		resputil.Error(c, "Failed to generate captcha", resputil.NotSpecified)
		return
	}
	resp := GenerateCaptchaResp{
		CaptchaID: id,
		ImageData: b64s,
	}
	resputil.Success(c, resp)
}

// VerifyCaptcha verifies the captcha answer
func (mgr *CaptchaMgr) VerifyCaptcha(captchaID, answer string) bool {
	return mgr.store.Verify(captchaID, answer, true)
}

// Global captcha manager instance
var globalCaptchaMgr *CaptchaMgr

// SetGlobalCaptchaMgr sets the global captcha manager
func SetGlobalCaptchaMgr(mgr *CaptchaMgr) {
	globalCaptchaMgr = mgr
}

// GetGlobalCaptchaMgr returns the global captcha manager
func GetGlobalCaptchaMgr() *CaptchaMgr {
	return globalCaptchaMgr
}
