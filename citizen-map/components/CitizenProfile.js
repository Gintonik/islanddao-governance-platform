
import React from 'react';
import styled from 'styled-components';

function CitizenProfile({ citizen, onClose }) {
  if (!citizen) return null;

  const profileNftId = citizen.pfp || citizen.primaryNft;
  const profileImage = profileNftId && citizen.nftMetadata && citizen.nftMetadata[profileNftId] 
    ? citizen.nftMetadata[profileNftId].image 
    : 'https://via.placeholder.com/300?text=Profile+Image';

  return (
    <ProfileOverlay onClick={onClose}>
      <ProfileContainer onClick={(e) => e.stopPropagation()}>
        <CloseButton onClick={onClose}>×</CloseButton>
        
        <ProfileHeader>
          <ProfileImage src={profileImage} alt="Profile" />
          <ProfileInfo>
            <h2>{citizen.nickname || 'Anonymous Citizen'}</h2>
            <WalletAddress>
              {citizen.wallet.substring(0, 8)}...{citizen.wallet.substring(citizen.wallet.length - 6)}
            </WalletAddress>
            <Location>
              📍 {citizen.location[0].toFixed(4)}, {citizen.location[1].toFixed(4)}
            </Location>
          </ProfileInfo>
        </ProfileHeader>

        <ProfileContent>
          {citizen.bio && (
            <Section>
              <SectionTitle>Bio</SectionTitle>
              <Bio>{citizen.bio}</Bio>
            </Section>
          )}

          <Section>
            <SectionTitle>Social Links</SectionTitle>
            <SocialLinksGrid>
              {citizen.socials?.x && (
                <SocialLink href={citizen.socials.x} target="_blank" rel="noopener noreferrer">
                  <SocialIcon>𝕏</SocialIcon>
                  <span>Twitter/X</span>
                </SocialLink>
              )}
              {citizen.socials?.telegram && (
                <SocialLink href={citizen.socials.telegram} target="_blank" rel="noopener noreferrer">
                  <SocialIcon>📱</SocialIcon>
                  <span>Telegram</span>
                </SocialLink>
              )}
              {citizen.socials?.discord && (
                <SocialLink>
                  <SocialIcon>🎮</SocialIcon>
                  <span>{citizen.socials.discord}</span>
                </SocialLink>
              )}
            </SocialLinksGrid>
          </Section>

          <Section>
            <SectionTitle>PERK NFTs ({citizen.nfts?.length || 0})</SectionTitle>
            <NFTGrid>
              {citizen.nfts?.map((nftId, index) => {
                const metadata = citizen.nftMetadata && citizen.nftMetadata[nftId];
                const isPrimary = nftId === citizen.primaryNft;
                const isProfile = nftId === (citizen.pfp || citizen.primaryNft);
                
                return (
                  <NFTCard key={index} isPrimary={isPrimary} isProfile={isProfile}>
                    <NFTImage 
                      src={metadata ? metadata.image : 'https://via.placeholder.com/150?text=NFT'}
                      alt={metadata ? metadata.name : 'PERK NFT'}
                      onError={(e) => {
                        e.target.onerror = null;
                        e.target.src = 'https://via.placeholder.com/150?text=NFT+Image';
                      }}
                    />
                    <NFTInfo>
                      <NFTName>{metadata ? metadata.name : `PERK NFT #${index+1}`}</NFTName>
                      <NFTId>{nftId.substring(0, 6)}...{nftId.substring(nftId.length - 4)}</NFTId>
                      {isPrimary && <Badge>Primary</Badge>}
                      {isProfile && <Badge profile>Profile</Badge>}
                    </NFTInfo>
                  </NFTCard>
                );
              })}
            </NFTGrid>
          </Section>

          {/* Governance Power Section */}
          {parseFloat(citizen.governance_power) > 0 && (
            <Section>
              <SectionTitle>Governance Power</SectionTitle>
              <GovernanceContainer>
                <TotalPowerCard>
                  <TotalPowerLabel>Total Voting Power</TotalPowerLabel>
                  <TotalPowerValue>
                    {parseFloat(citizen.governance_power || 0).toLocaleString(undefined, { 
                      minimumFractionDigits: 0, 
                      maximumFractionDigits: 3 
                    })} ISLAND
                  </TotalPowerValue>
                  <TotalPowerNote>This is your complete voting power in governance</TotalPowerNote>
                </TotalPowerCard>
                
                <PowerBreakdown>
                  <BreakdownTitle>Power Breakdown</BreakdownTitle>
                  <BreakdownItem>
                    <BreakdownLabel>Native Power</BreakdownLabel>
                    <BreakdownValue>
                      {parseFloat(citizen.native_power || 0).toLocaleString(undefined, { 
                        minimumFractionDigits: 0, 
                        maximumFractionDigits: 3 
                      })} ISLAND
                    </BreakdownValue>
                    <BreakdownDesc>From your own token deposits</BreakdownDesc>
                  </BreakdownItem>
                  
                  <BreakdownItem>
                    <BreakdownLabel>Delegated Power</BreakdownLabel>
                    <BreakdownValue>
                      {parseFloat(citizen.delegated_power || 0).toLocaleString(undefined, { 
                        minimumFractionDigits: 0, 
                        maximumFractionDigits: 3 
                      })} ISLAND
                    </BreakdownValue>
                    <BreakdownDesc>Delegated from other members</BreakdownDesc>
                  </BreakdownItem>
                </PowerBreakdown>
              </GovernanceContainer>
            </Section>
          )}

          <Section>
            <SectionTitle>Member Since</SectionTitle>
            <MemberSince>
              {new Date(citizen.timestamp).toLocaleDateString('en-US', { 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric' 
              })}
            </MemberSince>
          </Section>
        </ProfileContent>
      </ProfileContainer>
    </ProfileOverlay>
  );
}

// Styled Components
const ProfileOverlay = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.8);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 2000;
  padding: 20px;
`;

const ProfileContainer = styled.div`
  background-color: #1a1a1a;
  border-radius: 12px;
  width: 100%;
  max-width: 600px;
  max-height: 90vh;
  overflow-y: auto;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
  border: 1px solid #333;
  position: relative;
`;

const CloseButton = styled.button`
  position: absolute;
  top: 15px;
  right: 15px;
  background: none;
  border: none;
  color: #aaa;
  font-size: 28px;
  cursor: pointer;
  z-index: 10;
  padding: 0;
  line-height: 1;
  
  &:hover {
    color: white;
  }
`;

const ProfileHeader = styled.div`
  display: flex;
  align-items: center;
  padding: 30px 30px 20px;
  border-bottom: 1px solid #333;
  gap: 20px;
`;

const ProfileImage = styled.img`
  width: 120px;
  height: 120px;
  border-radius: 12px;
  object-fit: cover;
  border: 3px solid #9945FF;
  box-shadow: 0 4px 16px rgba(153, 69, 255, 0.3);
`;

const ProfileInfo = styled.div`
  flex: 1;
  color: white;
  
  h2 {
    margin: 0 0 8px 0;
    font-size: 24px;
    font-weight: bold;
  }
`;

const WalletAddress = styled.div`
  font-family: monospace;
  color: #9945FF;
  font-size: 16px;
  margin-bottom: 4px;
`;

const Location = styled.div`
  color: #aaa;
  font-size: 14px;
`;

const ProfileContent = styled.div`
  padding: 20px 30px 30px;
`;

const Section = styled.div`
  margin-bottom: 30px;
  
  &:last-child {
    margin-bottom: 0;
  }
`;

const SectionTitle = styled.h3`
  color: white;
  font-size: 18px;
  margin: 0 0 15px 0;
  padding-bottom: 8px;
  border-bottom: 1px solid #333;
`;

const Bio = styled.p`
  color: #ddd;
  line-height: 1.6;
  margin: 0;
`;

const SocialLinksGrid = styled.div`
  display: flex;
  gap: 15px;
  flex-wrap: wrap;
`;

const SocialLink = styled.a`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 15px;
  background-color: #222;
  border-radius: 8px;
  color: white;
  text-decoration: none;
  transition: background-color 0.2s;
  
  &:hover {
    background-color: #333;
  }
`;

const SocialIcon = styled.span`
  font-size: 16px;
`;

const NFTGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 15px;
`;

const NFTCard = styled.div`
  background-color: #222;
  border-radius: 8px;
  overflow: hidden;
  border: 2px solid ${props => 
    props.isProfile ? '#45C0FF' : 
    props.isPrimary ? '#FF9945' : '#333'
  };
  transition: transform 0.2s;
  
  &:hover {
    transform: translateY(-2px);
  }
`;

const NFTImage = styled.img`
  width: 100%;
  height: 140px;
  object-fit: cover;
`;

const NFTInfo = styled.div`
  padding: 12px;
`;

const NFTName = styled.div`
  color: white;
  font-weight: bold;
  font-size: 14px;
  margin-bottom: 4px;
`;

const NFTId = styled.div`
  color: #aaa;
  font-size: 12px;
  font-family: monospace;
  margin-bottom: 8px;
`;

const Badge = styled.span`
  background-color: ${props => props.profile ? '#45C0FF' : '#FF9945'};
  color: white;
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 11px;
  font-weight: bold;
`;

const PlaceholderContent = styled.div`
  text-align: center;
  padding: 30px 20px;
  background-color: #222;
  border-radius: 8px;
  border: 2px dashed #444;
`;

const PlaceholderIcon = styled.div`
  font-size: 32px;
  margin-bottom: 10px;
`;

const PlaceholderText = styled.div`
  color: #aaa;
  font-size: 16px;
  margin-bottom: 8px;
`;

const PlaceholderSubtext = styled.div`
  color: #666;
  font-size: 14px;
  line-height: 1.4;
`;

const MemberSince = styled.div`
  color: #ddd;
  font-size: 16px;
`;

const GovernanceContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: 20px;
`;

const TotalPowerCard = styled.div`
  background: linear-gradient(135deg, #9945FF 0%, #14F195 100%);
  border-radius: 12px;
  padding: 24px;
  text-align: center;
  color: white;
  box-shadow: 0 4px 16px rgba(153, 69, 255, 0.3);
`;

const TotalPowerLabel = styled.div`
  font-size: 16px;
  font-weight: 600;
  margin-bottom: 8px;
  opacity: 0.9;
`;

const TotalPowerValue = styled.div`
  font-size: 28px;
  font-weight: bold;
  margin-bottom: 8px;
  text-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
`;

const TotalPowerNote = styled.div`
  font-size: 14px;
  opacity: 0.8;
  font-style: italic;
`;

const PowerBreakdown = styled.div`
  background-color: #222;
  border-radius: 8px;
  padding: 20px;
  border: 1px solid #333;
`;

const BreakdownTitle = styled.div`
  color: #aaa;
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 16px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
`;

const BreakdownItem = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding: 12px 0;
  border-bottom: 1px solid #333;
  
  &:last-child {
    border-bottom: none;
  }
`;

const BreakdownLabel = styled.div`
  color: white;
  font-weight: 500;
  flex: 1;
`;

const BreakdownValue = styled.div`
  color: #14F195;
  font-weight: bold;
  font-family: monospace;
  text-align: right;
  flex: 1;
`;

const BreakdownDesc = styled.div`
  color: #888;
  font-size: 12px;
  margin-top: 4px;
  flex: 1;
`;

export default CitizenProfile;
