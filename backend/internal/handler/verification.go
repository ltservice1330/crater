package handler

import (
	"crypto/rand"
	"fmt"
	"math/big"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	imrocreq "github.com/imroc/req/v3"
	"k8s.io/klog/v2"

	"github.com/raids-lab/crater/internal/resputil"
	"github.com/raids-lab/crater/pkg/config"
)

//nolint:gochecknoinits // This is the standard way to register a gin handler.
func init() {
	Registers = append(Registers, NewVerificationMgr)
}

const (
	verificationTTLMinutes = 10
	maxFetch1Min           = 1
	maxFetch5Min           = 5
	maxFetchDaily          = 20
	maxVerifyAttempts      = 5
	bytelength             = 16
	maxBigInt              = 900000
)

type VerificationMgr struct {
	name     string
	store    *VerificationStore
	req      *imrocreq.Client
	smsToken string
	smsMu    sync.RWMutex
}

func NewVerificationMgr(_ *RegisterConfig) Manager {
	mgr := &VerificationMgr{
		name:  "verification",
		store: NewVerificationStore(time.Minute * verificationTTLMinutes),
		req:   imrocreq.C(),
	}
	SetGlobalVerificationMgr(mgr)
	return mgr
}

func (mgr *VerificationMgr) GetName() string { return mgr.name }

func (mgr *VerificationMgr) RegisterPublic(g *gin.RouterGroup) {
	g.POST("send", mgr.SendVerificationCode)
	g.POST("verify", mgr.VerifyCode)
}

func (mgr *VerificationMgr) RegisterProtected(_ *gin.RouterGroup) {}

func (mgr *VerificationMgr) RegisterAdmin(_ *gin.RouterGroup) {}

// VerificationStore stores verification codes with expiration
type VerificationStore struct {
	data    map[string]*VerificationItem
	history map[string][]time.Time // Track request history per contact
	mu      sync.RWMutex
	ttl     time.Duration
}

type VerificationItem struct {
	code      string
	contact   string // email or phone number
	expiresAt time.Time
	attempts  int // Track verification attempts
}

func NewVerificationStore(ttl time.Duration) *VerificationStore {
	store := &VerificationStore{
		data:    make(map[string]*VerificationItem),
		history: make(map[string][]time.Time),
		ttl:     ttl,
	}
	// Clean up expired codes every minute
	go func() {
		ticker := time.NewTicker(time.Minute)
		defer ticker.Stop()
		for range ticker.C {
			store.cleanup()
		}
	}()
	return store
}

func (s *VerificationStore) CheckRateLimit(contact string) error {
	s.mu.RLock()
	defer s.mu.RUnlock()

	times := s.history[contact]
	if len(times) == 0 {
		return nil
	}

	now := time.Now()
	var in1Min, in5Min, in24Hour int

	for i := len(times) - 1; i >= 0; i-- {
		t := times[i]
		if now.Sub(t) <= time.Minute {
			in1Min++
		}
		if now.Sub(t) <= 5*time.Minute {
			in5Min++
		}
		if now.Sub(t) <= 24*time.Hour {
			in24Hour++
		}
	}

	if in1Min >= maxFetch1Min {
		return fmt.Errorf("please wait 1 minute before requesting again")
	}
	if in5Min >= maxFetch5Min {
		return fmt.Errorf("too many requests, please wait 5 minutes")
	}
	if in24Hour >= maxFetchDaily {
		return fmt.Errorf("daily limit exceeded")
	}

	return nil
}

func (s *VerificationStore) Set(id, code, contact string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	// Invalidate previous codes for this contact
	for existingID, item := range s.data {
		if item.contact == contact {
			delete(s.data, existingID)
		}
	}

	s.data[id] = &VerificationItem{
		code:      code,
		contact:   contact,
		expiresAt: time.Now().Add(s.ttl),
		attempts:  0,
	}
	// Record history
	s.history[contact] = append(s.history[contact], time.Now())
	return nil
}

func (s *VerificationStore) Verify(id, code string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()

	item, exists := s.data[id]
	if !exists {
		return false
	}

	// Check if expired
	if time.Now().After(item.expiresAt) {
		delete(s.data, id)
		return false
	}

	// Increment attempts
	item.attempts++

	if item.attempts > maxVerifyAttempts {
		delete(s.data, id)
		return false
	}

	// Verify code
	if item.code == code {
		delete(s.data, id)
		return true
	}

	return false
}

func (s *VerificationStore) cleanup() {
	s.mu.Lock()
	defer s.mu.Unlock()

	now := time.Now()
	for id, item := range s.data {
		if now.After(item.expiresAt) {
			delete(s.data, id)
		}
	}

	// Clean up history older than 24 hours
	for contact, times := range s.history {
		var valid []time.Time
		for _, t := range times {
			if now.Sub(t) <= 24*time.Hour {
				valid = append(valid, t)
			}
		}
		if len(valid) == 0 {
			delete(s.history, contact)
		} else {
			s.history[contact] = valid
		}
	}
}

type SendVerificationCodeReq struct {
	Contact string `json:"contact" binding:"required"` // Email or phone number
}

type SendVerificationCodeResp struct {
	VerificationID string `json:"verificationId"`
	ExpiresIn      int    `json:"expiresIn"` // seconds
}

type VerifyCodeReq struct {
	VerificationID string `json:"verificationId" binding:"required"`
	Code           string `json:"code" binding:"required"`
}

type VerifyCodeResp struct {
	Valid   bool   `json:"valid"`
	Contact string `json:"contact,omitempty"`
}

// generateVerificationCode generates a random 6-digit verification code
func generateVerificationCode() (string, error) {
	// Generate a random number between 100000 and 999999
	maxVal := big.NewInt(maxBigInt)
	n, err := rand.Int(rand.Reader, maxVal)
	if err != nil {
		return "", err
	}
	code := n.Int64() + 100000
	return fmt.Sprintf("%06d", code), nil
}

// generateVerificationID generates a unique ID for the verification session
func generateVerificationID() (string, error) {
	b := make([]byte, bytelength)
	_, err := rand.Read(b)
	if err != nil {
		return "", err
	}
	return fmt.Sprintf("%x", b), nil
}

// SendVerificationCode godoc
//
//	@Summary		发送验证码
//	@Description	向指定的邮箱或手机号发送验证码
//	@Tags			Verification
//	@Accept			json
//	@Produce		json
//	@Param			data	body		SendVerificationCodeReq						true	"联系方式"
//	@Success		200		{object}	resputil.Response[SendVerificationCodeResp]	"验证码发送成功"
//	@Failure		400		{object}	resputil.Response[any]						"请求参数错误"
//	@Failure		500		{object}	resputil.Response[any]						"发送验证码失败"
//	@Router			/verification/send [post]
func (mgr *VerificationMgr) SendVerificationCode(c *gin.Context) {
	var req SendVerificationCodeReq
	if err := c.ShouldBind(&req); err != nil {
		resputil.BadRequestError(c, err.Error())
		return
	}

	// Check rate limit before generating/sending
	if err := mgr.store.CheckRateLimit(req.Contact); err != nil {
		resputil.Error(c, err.Error(), resputil.InvalidRequest)
		return
	}

	// Generate verification code
	code, err := generateVerificationCode()
	if err != nil {
		resputil.Error(c, "Failed to generate verification code", resputil.NotSpecified)
		return
	}

	// Generate verification ID
	verificationID, err := generateVerificationID()
	if err != nil {
		resputil.Error(c, "Failed to generate verification ID", resputil.NotSpecified)
		return
	}

	cfg := config.GetConfig().Verification
	isPhone := !strings.Contains(req.Contact, "@")

	if isPhone && cfg.SMS.Enable && cfg.SMS.Provider == "custom" {
		if err := mgr.sendCustomSMS(req.Contact, code); err != nil {
			klog.Errorf("Failed to send custom SMS to %s: %v", req.Contact, err)
			resputil.Error(c, "Failed to verify. Ensure SMS configuration is correct.", resputil.NotSpecified)
			return
		}
	} else {
		// Log for other providers or if disabled
		klog.Infof("Verification code for %s: %s (ID: %s)", req.Contact, code, verificationID)
	}

	// Store verification code only if sending succeeded
	if err := mgr.store.Set(verificationID, code, req.Contact); err != nil {
		resputil.Error(c, "Failed to store verification code", resputil.NotSpecified)
		return
	}

	resp := SendVerificationCodeResp{
		VerificationID: verificationID,
		ExpiresIn:      int(mgr.store.ttl.Seconds()),
	}
	resputil.Success(c, resp)
}

func (mgr *VerificationMgr) getSMSToken(apiUrl, appID, secret string) (string, error) {
	loginUrl := fmt.Sprintf("%s/smsapi/sms/login", apiUrl)
	var result struct {
		Code    string `json:"code"`
		Message string `json:"message"`
		Data    struct {
			AccessToken string `json:"access_token"`
		} `json:"data"`
	}

	resp, err := mgr.req.R().
		SetBody(map[string]string{
			"appid":  appID,
			"secret": secret,
		}).
		SetSuccessResult(&result).
		Post(loginUrl)

	if err != nil {
		return "", err
	}
	if !resp.IsSuccessState() || result.Code != "200" {
		return "", fmt.Errorf("failed to login sms api: %s", result.Message)
	}

	return result.Data.AccessToken, nil
}

func (mgr *VerificationMgr) doSendSMS(token, apiUrl, phone, code, busiCode string, visualMobile *string) (string, error) {
	// Send verification sms using the provided specification
	sendUrl := fmt.Sprintf("%s/smsapi/sms/send", apiUrl)
	var result map[string]any
	body := map[string]any{
		"busiCode":  busiCode,
		"phone":     phone,
		"sendDelay": "false",
		"sendType":  "1",
		"values": map[string]string{
			"code": code,
		},
		"visualMobile": visualMobile, // This correctly translates to null if visualMobile pointer is nil
	}

	_, err := mgr.req.R().
		SetHeader("access_token", token).
		SetBody(body).
		SetSuccessResult(&result).
		Post(sendUrl)

	if err != nil {
		return "", err
	}

	codeStr := fmt.Sprintf("%v", result["code"])
	return codeStr, nil
}

func (mgr *VerificationMgr) sendCustomSMS(phone, code string) error {
	cfg := config.GetConfig().Verification.SMS

	mgr.smsMu.RLock()
	token := mgr.smsToken
	mgr.smsMu.RUnlock()

	// Initial token retrieval if empty
	if token == "" {
		newToken, err := mgr.getSMSToken(cfg.APIURL, cfg.AppID, cfg.Secret)
		if err != nil {
			return err
		}
		mgr.smsMu.Lock()
		mgr.smsToken = newToken
		mgr.smsMu.Unlock()
		token = newToken
	}

	var vm *string
	if cfg.VisualMobile != "" {
		vm = &cfg.VisualMobile
	}

	respCode, err := mgr.doSendSMS(token, cfg.APIURL, phone, code, cfg.BusiCode, vm)
	if err != nil {
		return err
	}

	// 407 identifies an invalid or expired access token
	if respCode == "407" {
		klog.Info("SMS access token invalid, relogging...")
		newToken, err := mgr.getSMSToken(cfg.APIURL, cfg.AppID, cfg.Secret)
		if err != nil {
			return err
		}
		mgr.smsMu.Lock()
		mgr.smsToken = newToken
		mgr.smsMu.Unlock()
		token = newToken

		// Retry SMS sending process once
		respCode, err = mgr.doSendSMS(token, cfg.APIURL, phone, code, cfg.BusiCode, vm)
		if err != nil {
			return err
		}
	}

	if respCode != "200" {
		return fmt.Errorf("failed to send sms, response code: %s", respCode)
	}

	return nil
}

// VerifyCode godoc
//
//	@Summary		验证验证码
//	@Description	验证用户输入的验证码是否正确
//	@Tags			Verification
//	@Accept			json
//	@Produce		json
//	@Param			data	body		VerifyCodeReq						true	"验证码信息"
//	@Success		200		{object}	resputil.Response[VerifyCodeResp]	"验证结果"
//	@Failure		400		{object}	resputil.Response[any]				"请求参数错误"
//	@Router			/verification/verify [post]
func (mgr *VerificationMgr) VerifyCode(c *gin.Context) {
	var req VerifyCodeReq
	if err := c.ShouldBind(&req); err != nil {
		resputil.BadRequestError(c, err.Error())
		return
	}

	valid := mgr.store.Verify(req.VerificationID, req.Code)

	resp := VerifyCodeResp{
		Valid: valid,
	}
	resputil.Success(c, resp)
}

// VerifyCodeInternal verifies the verification code (internal use)
func (mgr *VerificationMgr) VerifyCodeInternal(verificationID, code string) bool {
	return mgr.store.Verify(verificationID, code)
}

// Global verification manager instance
var globalVerificationMgr *VerificationMgr

// SetGlobalVerificationMgr sets the global verification manager
func SetGlobalVerificationMgr(mgr *VerificationMgr) {
	globalVerificationMgr = mgr
}

// GetGlobalVerificationMgr returns the global verification manager
func GetGlobalVerificationMgr() *VerificationMgr {
	return globalVerificationMgr
}
